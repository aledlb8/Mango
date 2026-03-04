import { SQL } from "bun"
import { batchSize, databaseUrl, intervalMs, maxAttempts } from "./config"
import {
  claimPendingJobs,
  connect,
  deleteSubscriptionByID,
  failExhaustedPendingJobs,
  listSubscriptionsForUser,
  markJobFailed,
  markJobRetry,
  markJobSent
} from "./db"
import {
  ensureWebPushConfigured,
  errorMessage,
  isExpiredSubscriptionError,
  isRetryablePushError,
  sendPush
} from "./push"

async function processBatch(sql: SQL): Promise<void> {
  const exhaustedCount = await failExhaustedPendingJobs(sql, maxAttempts)
  if (exhaustedCount > 0) {
    console.warn(`[notification-worker] marked ${exhaustedCount} exhausted jobs as failed.`)
  }

  const jobs = await claimPendingJobs(sql, batchSize, maxAttempts)
  if (jobs.length === 0) {
    return
  }

  const webPushEnabled = ensureWebPushConfigured()
  if (!webPushEnabled) {
    console.warn("[notification-worker] VAPID keys are missing; marking jobs as failed.")
  }

  for (const job of jobs) {
    if (!webPushEnabled) {
      await markJobFailed(sql, job.id, "Web push is not configured.")
      continue
    }

    const subscriptions = await listSubscriptionsForUser(sql, job.userId)
    if (subscriptions.length === 0) {
      await markJobFailed(sql, job.id, "No push subscriptions for user.")
      continue
    }

    let delivered = false
    let hasRetryableFailure = false
    let lastError = "Failed to deliver notification."

    for (const subscription of subscriptions) {
      try {
        await sendPush(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          },
          {
            title: job.title,
            body: job.body,
            url: job.url,
            jobId: job.id
          }
        )
        delivered = true
      } catch (reason) {
        lastError = errorMessage(reason)
        if (isRetryablePushError(reason)) {
          hasRetryableFailure = true
        }
        if (isExpiredSubscriptionError(reason)) {
          await deleteSubscriptionByID(sql, subscription.id)
        }
      }
    }

    if (delivered) {
      await markJobSent(sql, job.id)
      continue
    }

    if (hasRetryableFailure && job.attempts < maxAttempts) {
      await markJobRetry(sql, job.id, lastError)
    } else {
      await markJobFailed(sql, job.id, lastError)
    }
  }
}

async function main(): Promise<void> {
  const sql = await connect(databaseUrl)
  console.log(
    `[notification-worker] started (interval: ${intervalMs}ms, batch: ${batchSize}, maxAttempts: ${maxAttempts})`
  )

  await processBatch(sql).catch((reason) => {
    console.error("[notification-worker] initial batch failed:", errorMessage(reason))
  })

  setInterval(() => {
    void processBatch(sql).catch((reason) => {
      console.error("[notification-worker] batch failed:", errorMessage(reason))
    })
  }, intervalMs)
}

void main().catch((reason) => {
  console.error("[notification-worker] fatal:", errorMessage(reason))
  process.exit(1)
})
