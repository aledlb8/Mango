export const intervalMs = Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS ?? 30_000)
export const batchSize = Math.max(1, Number(process.env.NOTIFICATION_WORKER_BATCH_SIZE ?? 25))
export const databaseUrl = process.env.DATABASE_URL ?? "postgres://mango:mango@localhost:5432/mango"

export const vapidSubject = process.env.VAPID_SUBJECT ?? ""
export const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? ""
export const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? ""

export function isWebPushConfigured(): boolean {
  return Boolean(vapidSubject && vapidPublicKey && vapidPrivateKey)
}
