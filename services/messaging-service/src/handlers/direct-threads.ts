import type { CreateDirectThreadRequest, CreateMessageRequest, DirectThread, Message } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"
import { normalizeAttachments } from "./message-attachments"
import { requireDirectThreadParticipant } from "./direct-threads-common"

function normalizeParticipantIds(participantIds: string[] | undefined, ownerId: string): string[] {
  if (!Array.isArray(participantIds)) {
    return []
  }

  return Array.from(
    new Set(
      participantIds
        .map((participantId) => participantId.trim())
        .filter((participantId) => participantId.length > 0 && participantId !== ownerId)
    )
  )
}

export async function handleCreateDirectThread(request: Request, ctx: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const body = await readJson<CreateDirectThreadRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const participantIds = normalizeParticipantIds(body.participantIds, user.id)
  if (participantIds.length === 0) {
    return error(ctx.corsOrigin, 400, "At least one participant is required.")
  }

  for (const participantId of participantIds) {
    const participant = await ctx.store.findUserById(participantId)
    if (!participant) {
      return error(ctx.corsOrigin, 404, `User ${participantId} not found.`)
    }
  }

  const title = body.title?.trim() ?? ""
  const created = await ctx.store.createDirectThread(user.id, participantIds, title)
  return json(ctx.corsOrigin, 201, created)
}

export async function handleListDirectThreads(request: Request, ctx: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const threads: DirectThread[] = await ctx.store.listDirectThreadsForUser(user.id)
  return json(ctx.corsOrigin, 200, threads)
}

export async function handleCreateDirectThreadMessage(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadParticipant(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  const body = await readJson<CreateMessageRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const text = body.body?.trim()
  if (!text) {
    return error(ctx.corsOrigin, 400, "Message body is required.")
  }

  if (text.length > 2000) {
    return error(ctx.corsOrigin, 400, "Message body exceeds 2000 characters.")
  }

  const attachments = normalizeAttachments(body.attachments, access.user.id)
  const created: Message = await ctx.store.createMessage(access.thread.channelId, access.user.id, text, attachments)

  return json(ctx.corsOrigin, 201, created)
}

export async function handleListDirectThreadMessages(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadParticipant(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  const messages: Message[] = await ctx.store.listMessages(access.thread.channelId)
  return json(ctx.corsOrigin, 200, messages)
}
