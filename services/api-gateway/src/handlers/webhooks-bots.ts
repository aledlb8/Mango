import type {
  CreateServerBotRequest,
  CreateWebhookRequest,
  ExecuteBotMessageRequest,
  ExecuteWebhookRequest,
  Message
} from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"
import { normalizeAttachments } from "./message-attachments"
import { enqueueMessageNotificationsBestEffort } from "./notification-dispatch"

function readBotToken(request: Request): string | null {
  const raw = request.headers.get("authorization")?.trim() ?? ""
  if (!raw) {
    return null
  }

  const [scheme, token] = raw.split(" ")
  if (scheme?.toLowerCase() !== "bot" || !token?.trim()) {
    return null
  }

  return token.trim()
}

export async function handleCreateChannelWebhook(
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

  if (!(await ctx.store.hasServerPermission(channel.serverId, user.id, "manage_channels"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_channels.")
  }

  const body = await readJson<CreateWebhookRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const name = body.name?.trim()
  if (!name) {
    return error(ctx.corsOrigin, 400, "name is required.")
  }

  if (name.length > 80) {
    return error(ctx.corsOrigin, 400, "name exceeds 80 characters.")
  }

  const created = await ctx.store.createWebhook(channel.id, user.id, name)
  return json(ctx.corsOrigin, 201, created)
}

export async function handleListChannelWebhooks(
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

  if (!(await ctx.store.hasServerPermission(channel.serverId, user.id, "manage_channels"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_channels.")
  }

  const hooks = await ctx.store.listWebhooks(channel.id)
  return json(ctx.corsOrigin, 200, hooks)
}

export async function handleExecuteWebhook(
  request: Request,
  webhookId: string,
  webhookToken: string,
  ctx: RouteContext
): Promise<Response> {
  const body = await readJson<ExecuteWebhookRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const text = body.body?.trim()
  if (!text) {
    return error(ctx.corsOrigin, 400, "body is required.")
  }

  if (text.length > 2000) {
    return error(ctx.corsOrigin, 400, "body exceeds 2000 characters.")
  }

  const attachments = normalizeAttachments(body.attachments, "system")
  const message = await ctx.store.executeWebhook(webhookId, webhookToken, text, attachments)
  if (!message) {
    return error(ctx.corsOrigin, 404, "Webhook not found or token is invalid.")
  }

  ctx.realtimeHub.publishMessageCreated(message)
  await enqueueMessageNotificationsBestEffort(message, ctx)
  return json(ctx.corsOrigin, 201, message)
}

export async function handleCreateServerBot(
  request: Request,
  serverId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const body = await readJson<CreateServerBotRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const name = body.name?.trim()
  if (!name) {
    return error(ctx.corsOrigin, 400, "name is required.")
  }

  if (name.length > 80) {
    return error(ctx.corsOrigin, 400, "name exceeds 80 characters.")
  }

  const created = await ctx.store.createServerBot(serverId, user.id, name)
  return json(ctx.corsOrigin, 201, created)
}

export async function handleListServerBots(
  request: Request,
  serverId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const bots = await ctx.store.listServerBots(serverId)
  return json(ctx.corsOrigin, 200, bots)
}

export async function handleRevokeServerBot(
  request: Request,
  serverId: string,
  botId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const bot = await ctx.store.revokeServerBot(serverId, botId)
  if (!bot) {
    return error(ctx.corsOrigin, 404, "Bot not found.")
  }

  return json(ctx.corsOrigin, 200, bot)
}

export async function handleRotateServerBotToken(
  request: Request,
  serverId: string,
  botId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const rotated = await ctx.store.rotateServerBotToken(serverId, botId)
  if (!rotated) {
    return error(ctx.corsOrigin, 404, "Bot not found or already revoked.")
  }

  return json(ctx.corsOrigin, 200, rotated)
}

export async function handleExecuteBotMessage(request: Request, ctx: RouteContext): Promise<Response> {
  const botToken = readBotToken(request)
  if (!botToken) {
    return error(ctx.corsOrigin, 401, "Missing bot token. Use Authorization: Bot <token>.")
  }

  const body = await readJson<ExecuteBotMessageRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const channelId = body.channelId?.trim()
  if (!channelId) {
    return error(ctx.corsOrigin, 400, "channelId is required.")
  }

  const text = body.body?.trim()
  if (!text) {
    return error(ctx.corsOrigin, 400, "body is required.")
  }

  if (text.length > 2000) {
    return error(ctx.corsOrigin, 400, "body exceeds 2000 characters.")
  }

  const attachments = normalizeAttachments(body.attachments, "bot")
  const message: Message | null = await ctx.store.executeBotMessage(botToken, channelId, text, attachments)
  if (!message) {
    return error(ctx.corsOrigin, 403, "Bot token is invalid or does not have access to this channel.")
  }

  ctx.realtimeHub.publishMessageCreated(message)
  await enqueueMessageNotificationsBestEffort(message, ctx)
  return json(ctx.corsOrigin, 201, message)
}
