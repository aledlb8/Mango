import { SQL } from "bun"

export type NotificationJob = {
  id: string
  userId: string
  title: string
  body: string
  url: string | null
  attempts: number
}

export type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

type NotificationJobRow = {
  id: string
  user_id: string
  title: string
  body: string
  url: string | null
  attempts: number
}

export async function connect(databaseUrl: string): Promise<SQL> {
  const sql = new SQL(databaseUrl)
  await sql`SELECT 1`
  return sql
}

export async function listPendingJobs(sql: SQL, limit: number): Promise<NotificationJob[]> {
  const rows = await sql<NotificationJobRow[]>`
    SELECT id, user_id, title, body, url, attempts
    FROM notification_jobs
    WHERE status = 'pending'
      AND attempts < 10
    ORDER BY created_at ASC
    LIMIT ${limit}
  `

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    url: row.url,
    attempts: row.attempts
  }))
}

export async function markJobAttempt(sql: SQL, jobId: string): Promise<void> {
  await sql`
    UPDATE notification_jobs
    SET attempts = attempts + 1
    WHERE id = ${jobId}
  `
}

export async function markJobSent(sql: SQL, jobId: string): Promise<void> {
  await sql`
    UPDATE notification_jobs
    SET status = 'sent',
        processed_at = NOW(),
        last_error = NULL
    WHERE id = ${jobId}
  `
}

export async function markJobFailed(sql: SQL, jobId: string, reason: string): Promise<void> {
  await sql`
    UPDATE notification_jobs
    SET status = 'failed',
        processed_at = NOW(),
        last_error = ${reason}
    WHERE id = ${jobId}
  `
}

export async function listSubscriptionsForUser(sql: SQL, userId: string): Promise<PushSubscriptionRow[]> {
  const rows = await sql<PushSubscriptionRow[]>`
    SELECT id, endpoint, p256dh, auth
    FROM push_subscriptions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `

  return rows
}

export async function deleteSubscriptionByID(sql: SQL, subscriptionId: string): Promise<void> {
  await sql`
    DELETE FROM push_subscriptions
    WHERE id = ${subscriptionId}
  `
}
