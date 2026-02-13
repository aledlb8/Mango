import type { ReadMarker, UpdateReadMarkerRequest } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"
import { requireDirectThreadParticipant } from "./direct-threads-common"

function emptyReadMarker(conversationId: string, userId: string): ReadMarker {
  return {
    conversationId,
    userId,
    lastReadMessageId: null,
    updatedAt: new Date().toISOString()
  }
}

export async function handleGetChannelReadMarker(
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

  if (!(await ctx.store.hasChannelPermission(channel.id, user.id, "read_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: read_messages.")
  }

  const marker = await ctx.store.getReadMarker(channelId, user.id)
  return json(ctx.corsOrigin, 200, marker ?? emptyReadMarker(channelId, user.id))
}

export async function handleUpsertChannelReadMarker(
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

  if (!(await ctx.store.hasChannelPermission(channel.id, user.id, "read_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: read_messages.")
  }

  const body = await readJson<UpdateReadMarkerRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const lastReadMessageId = body.lastReadMessageId?.trim() || null
  if (lastReadMessageId) {
    const message = await ctx.store.getMessageById(lastReadMessageId)
    if (!message || message.channelId !== channel.id) {
      return error(ctx.corsOrigin, 400, "lastReadMessageId must belong to this channel.")
    }
  }

  const marker = await ctx.store.upsertReadMarker(channelId, user.id, lastReadMessageId)
  return json(ctx.corsOrigin, 200, marker)
}

export async function handleGetDirectThreadReadMarker(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadParticipant(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  const marker = await ctx.store.getReadMarker(access.thread.id, access.user.id)
  return json(ctx.corsOrigin, 200, marker ?? emptyReadMarker(access.thread.id, access.user.id))
}

export async function handleUpsertDirectThreadReadMarker(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadParticipant(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  const body = await readJson<UpdateReadMarkerRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const lastReadMessageId = body.lastReadMessageId?.trim() || null
  if (lastReadMessageId) {
    const message = await ctx.store.getMessageById(lastReadMessageId)
    if (!message || message.channelId !== access.thread.channelId) {
      return error(ctx.corsOrigin, 400, "lastReadMessageId must belong to this direct thread.")
    }
  }

  const marker = await ctx.store.upsertReadMarker(access.thread.id, access.user.id, lastReadMessageId)
  return json(ctx.corsOrigin, 200, marker)
}
