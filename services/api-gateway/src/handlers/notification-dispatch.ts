import type { Message } from "@mango/contracts"
import type { RouteContext } from "../router-context"

function reasonMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message
  }

  return "unknown error"
}

function buildNotificationBody(body: string): string {
  const normalized = body.trim()
  if (normalized.length <= 140) {
    return normalized
  }

  return `${normalized.slice(0, 137)}...`
}

function buildNotificationUrl(message: Message, serverId: string | null): string | null {
  if (message.directThreadId) {
    return `/dm/${message.directThreadId}?message=${encodeURIComponent(message.id)}`
  }

  if (!serverId) {
    return null
  }

  return `/servers/${serverId}/channels/${message.channelId}?message=${encodeURIComponent(message.id)}`
}

export async function enqueueMessageNotifications(message: Message, ctx: RouteContext): Promise<void> {
  const body = buildNotificationBody(message.body)

  if (message.directThreadId) {
    const thread = await ctx.store.getDirectThreadById(message.directThreadId)
    if (!thread) {
      return
    }

    const title = thread.kind === "group" ? `New message in ${thread.title}` : "New direct message"
    const url = buildNotificationUrl(message, null)

    const recipients = thread.participantIds.filter((userId) => userId !== message.authorId)
    await Promise.all(
      recipients.map(async (userId) => {
        await ctx.store.enqueueNotification(userId, title, body, url)
      })
    )
    return
  }

  const channel = await ctx.store.getChannelById(message.channelId)
  if (!channel) {
    return
  }

  const server = await ctx.store.getServerById(channel.serverId)
  const members = await ctx.store.listServerMembers(channel.serverId)
  const url = buildNotificationUrl(message, channel.serverId)
  const title = server ? `#${channel.name} in ${server.name}` : `#${channel.name}`

  await Promise.all(
    members
      .filter((member) => member.id !== message.authorId)
      .map(async (member) => {
        if (!(await ctx.store.hasChannelPermission(channel.id, member.id, "read_messages"))) {
          return
        }

        await ctx.store.enqueueNotification(member.id, title, body, url)
      })
  )
}

export async function enqueueMessageNotificationsBestEffort(
  message: Message,
  ctx: RouteContext
): Promise<void> {
  try {
    await enqueueMessageNotifications(message, ctx)
  } catch (reason) {
    console.warn(
      `[api-gateway] Failed to enqueue notifications for message ${message.id}: ${reasonMessage(reason)}`
    )
  }
}
