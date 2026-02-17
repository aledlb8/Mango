import type {
  CreateForumThreadRequest,
  CreateMessageRequest,
  ForumThread,
  Message,
  UpdateForumThreadRequest
} from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"
import { normalizeAttachments } from "./message-attachments"
import { enqueueMessageNotificationsBestEffort } from "./notification-dispatch"

function parseIncludeArchived(request: Request): boolean {
  const raw = new URL(request.url).searchParams.get("includeArchived")
  if (!raw) {
    return false
  }
  return raw.trim().toLowerCase() === "true"
}

function parseThreadTags(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 10)
}

export async function handleCreateForumThread(
  request: Request,
  parentChannelId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const parentChannel = await ctx.store.getChannelById(parentChannelId)
  if (!parentChannel) {
    return error(ctx.corsOrigin, 404, "Parent channel not found.")
  }

  if (parentChannel.type !== "text") {
    return error(ctx.corsOrigin, 400, "Threads can only be created under text channels.")
  }

  if (!(await ctx.store.hasChannelPermission(parentChannel.id, user.id, "send_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: send_messages.")
  }

  const body = await readJson<CreateForumThreadRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const title = body.title?.trim()
  if (!title) {
    return error(ctx.corsOrigin, 400, "title is required.")
  }

  if (title.length > 120) {
    return error(ctx.corsOrigin, 400, "title exceeds 120 characters.")
  }

  const text = body.body?.trim()
  if (!text) {
    return error(ctx.corsOrigin, 400, "body is required.")
  }

  if (text.length > 2000) {
    return error(ctx.corsOrigin, 400, "body exceeds 2000 characters.")
  }

  const tags = parseThreadTags(body.tags)
  const attachments = normalizeAttachments(body.attachments, user.id)
  const created = await ctx.store.createForumThread({
    parentChannelId: parentChannel.id,
    ownerId: user.id,
    title,
    body: text,
    attachments,
    tags
  })

  ctx.realtimeHub.publishMessageCreated(created.starterMessage)
  await enqueueMessageNotificationsBestEffort(created.starterMessage, ctx)

  return json(ctx.corsOrigin, 201, created)
}

export async function handleListForumThreads(
  request: Request,
  parentChannelId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const parentChannel = await ctx.store.getChannelById(parentChannelId)
  if (!parentChannel) {
    return error(ctx.corsOrigin, 404, "Parent channel not found.")
  }

  if (!(await ctx.store.hasChannelPermission(parentChannel.id, user.id, "read_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: read_messages.")
  }

  const includeArchived = parseIncludeArchived(request)
  const threads = await ctx.store.listForumThreads(parentChannel.id, includeArchived)
  return json(ctx.corsOrigin, 200, threads)
}

async function requireThreadAccess(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<{ userId: string; thread: ForumThread } | Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const thread = await ctx.store.getForumThreadById(threadId)
  if (!thread) {
    return error(ctx.corsOrigin, 404, "Thread not found.")
  }

  const channel = await ctx.store.getChannelById(thread.threadChannelId)
  if (!channel) {
    return error(ctx.corsOrigin, 404, "Thread channel not found.")
  }

  if (!(await ctx.store.hasChannelPermission(channel.id, user.id, "read_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: read_messages.")
  }

  return {
    userId: user.id,
    thread
  }
}

export async function handleGetForumThread(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireThreadAccess(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  return json(ctx.corsOrigin, 200, access.thread)
}

export async function handleUpdateForumThread(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireThreadAccess(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  const canManage =
    access.thread.ownerId === access.userId ||
    (await ctx.store.hasServerPermission(access.thread.serverId, access.userId, "manage_channels"))
  if (!canManage) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_channels.")
  }

  const body = await readJson<UpdateForumThreadRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const title = typeof body.title === "string" ? body.title.trim() : null
  if (title !== null && title.length > 120) {
    return error(ctx.corsOrigin, 400, "title exceeds 120 characters.")
  }

  const tags = body.tags === undefined ? null : parseThreadTags(body.tags)
  const status = body.status ?? null
  if (status !== null && status !== "open" && status !== "archived") {
    return error(ctx.corsOrigin, 400, "status must be one of: open, archived.")
  }

  if (title === null && tags === null && status === null) {
    return error(ctx.corsOrigin, 400, "At least one field must be updated.")
  }

  const updated = await ctx.store.updateForumThread(threadId, {
    title,
    tags,
    status
  })
  if (!updated) {
    return error(ctx.corsOrigin, 404, "Thread not found.")
  }

  return json(ctx.corsOrigin, 200, updated)
}

export async function handleCreateForumThreadMessage(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireThreadAccess(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  if (access.thread.status === "archived") {
    return error(ctx.corsOrigin, 400, "Cannot send messages to an archived thread.")
  }

  if (!(await ctx.store.hasChannelPermission(access.thread.threadChannelId, access.userId, "send_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: send_messages.")
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

  const attachments = normalizeAttachments(body.attachments, access.userId)
  const message: Message = await ctx.store.createMessage(
    access.thread.threadChannelId,
    access.userId,
    text,
    attachments
  )
  ctx.realtimeHub.publishMessageCreated(message)
  await enqueueMessageNotificationsBestEffort(message, ctx)

  return json(ctx.corsOrigin, 201, message)
}

export async function handleListForumThreadMessages(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireThreadAccess(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  const messages = await ctx.store.listMessages(access.thread.threadChannelId)
  return json(ctx.corsOrigin, 200, messages)
}
