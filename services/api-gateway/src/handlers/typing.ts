import type { TypingIndicator, TypingIndicatorRequest } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"
import { requireDirectThreadParticipant } from "./direct-threads-common"

function buildTypingPayload(conversationId: string, directThreadId: string | null, userId: string, isTyping: boolean): TypingIndicator {
  const now = Date.now()
  const expiresAt = new Date(now + (isTyping ? 6000 : 0)).toISOString()

  return {
    conversationId,
    directThreadId,
    userId,
    isTyping,
    expiresAt
  }
}

function parseTypingState(body: TypingIndicatorRequest | null): boolean {
  if (!body) {
    return true
  }

  return body.isTyping !== false
}

export async function handleChannelTyping(
  request: Request,
  channelId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const channel = await ctx.store.getChannelById(channelId)
  if (!channel) {
    return error(ctx.corsOrigin, 404, "Channel not found.")
  }

  if (!(await ctx.store.hasChannelPermission(channel.id, user.id, "send_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: send_messages.")
  }

  const body = await readJson<TypingIndicatorRequest>(request)
  const payload = buildTypingPayload(channel.id, null, user.id, parseTypingState(body))
  ctx.realtimeHub.publishTypingUpdated(payload.conversationId, payload)

  return json(ctx.corsOrigin, 200, payload)
}

export async function handleDirectThreadTyping(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadParticipant(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  const body = await readJson<TypingIndicatorRequest>(request)
  const payload = buildTypingPayload(access.thread.id, access.thread.id, access.user.id, parseTypingState(body))
  ctx.realtimeHub.publishTypingUpdated(payload.conversationId, payload)

  return json(ctx.corsOrigin, 200, payload)
}
