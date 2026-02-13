import webpush from "web-push"
import { isWebPushConfigured, vapidPrivateKey, vapidPublicKey, vapidSubject } from "./config"

export type PushPayload = {
  title: string
  body: string
  url: string | null
  jobId: string
}

export type WebPushSubscription = {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

let configured = false

export function ensureWebPushConfigured(): boolean {
  if (configured) {
    return true
  }

  if (!isWebPushConfigured()) {
    return false
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  configured = true
  return true
}

export async function sendPush(
  subscription: WebPushSubscription,
  payload: PushPayload
): Promise<void> {
  await webpush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 60
  })
}

export function isExpiredSubscriptionError(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") {
    return false
  }

  const maybeStatusCode = (reason as { statusCode?: number }).statusCode
  return maybeStatusCode === 404 || maybeStatusCode === 410
}

export function errorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message
  }
  return "Unknown notification error."
}
