import { SQL } from "bun"
import { batchSize, databaseUrl, intervalMs } from "./config"
import {
  connect,
  deleteSubscriptionByID,
  listPendingJobs,
  listSubscriptionsForUser,
  markJobAttempt,
  markJobFailed,
  markJobSent
} from "./db"
import {
  ensureWebPushConfigured,
  errorMessage,
  isExpiredSubscriptionError,
  sendPush
} from "./push"

async function processBatch(sql: SQL): Promise<void> {
  const jobs = await listPendingJobs(sql, batchSize)
  if (jobs.length === 0) {
    return
  }

  const webPushEnabled = ensureWebPushConfigured()
  if (!webPushEnabled) {
    console.warn("[notification-worker] VAPID keys are missing; marking jobs as failed.")
  }

  for (const job of jobs) {
    await markJobAttempt(sql, job.id)

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
        if (isExpiredSubscriptionError(reason)) {
          await deleteSubscriptionByID(sql, subscription.id)
        }
      }
    }

    if (delivered) {
      await markJobSent(sql, job.id)
    } else {
      await markJobFailed(sql, job.id, lastError)
    }
  }
}

async function main(): Promise<void> {
  const sql = await connect(databaseUrl)
  console.log(`[notification-worker] started (interval: ${intervalMs}ms, batch: ${batchSize})`)

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
