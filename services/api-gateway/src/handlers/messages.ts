import type { AddReactionRequest, CreateMessageRequest, Message, UpdateMessageRequest } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"
import { normalizeAttachments } from "./message-attachments"

export async function handleCreateMessage(
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

  const attachments = normalizeAttachments(body.attachments, user.id)
  const message: Message = await ctx.store.createMessage(channelId, user.id, text, attachments)
  ctx.realtimeHub.publishMessageCreated(message)

  return json(ctx.corsOrigin, 201, message)
}

export async function handleListMessages(
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

  const messages = await ctx.store.listMessages(channelId)

  return json(ctx.corsOrigin, 200, messages)
}

export async function handleUpdateMessage(
  request: Request,
  messageId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const message = await ctx.store.getMessageById(messageId)
  if (!message) {
    return error(ctx.corsOrigin, 404, "Message not found.")
  }

  const channel = await ctx.store.getChannelById(message.channelId)
  if (!channel) {
    return error(ctx.corsOrigin, 404, "Channel not found.")
  }

  if (message.authorId !== user.id) {
    return error(ctx.corsOrigin, 403, "Only the message author can edit this message.")
  }

  if (!(await ctx.store.hasChannelPermission(channel.id, user.id, "send_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: send_messages.")
  }

  const body = await readJson<UpdateMessageRequest>(request)
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

  const updated = await ctx.store.updateMessage(messageId, text)
  if (!updated) {
    return error(ctx.corsOrigin, 404, "Message not found.")
  }

  ctx.realtimeHub.publishMessageUpdated(updated)
  return json(ctx.corsOrigin, 200, updated)
}

export async function handleDeleteMessage(
  request: Request,
  messageId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const message = await ctx.store.getMessageById(messageId)
  if (!message) {
    return error(ctx.corsOrigin, 404, "Message not found.")
  }

  const channel = await ctx.store.getChannelById(message.channelId)
  if (!channel) {
    return error(ctx.corsOrigin, 404, "Channel not found.")
  }

  if (message.authorId !== user.id) {
    return error(ctx.corsOrigin, 403, "Only the message author can delete this message.")
  }

  if (!(await ctx.store.hasChannelPermission(channel.id, user.id, "send_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: send_messages.")
  }

  const removed = await ctx.store.deleteMessage(messageId)
  if (!removed) {
    return error(ctx.corsOrigin, 404, "Message not found.")
  }

  ctx.realtimeHub.publishMessageDeleted(removed)
  return json(ctx.corsOrigin, 200, removed)
}

export async function handleAddReaction(
  request: Request,
  messageId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const message = await ctx.store.getMessageById(messageId)
  if (!message) {
    return error(ctx.corsOrigin, 404, "Message not found.")
  }

  const channel = await ctx.store.getChannelById(message.channelId)
  if (!channel) {
    return error(ctx.corsOrigin, 404, "Channel not found.")
  }

  if (!(await ctx.store.hasChannelPermission(channel.id, user.id, "read_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: read_messages.")
  }

  const body = await readJson<AddReactionRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const emoji = body.emoji?.trim()
  if (!emoji) {
    return error(ctx.corsOrigin, 400, "emoji is required.")
  }

  if (emoji.length > 64) {
    return error(ctx.corsOrigin, 400, "emoji exceeds 64 characters.")
  }

  const reactions = await ctx.store.addReaction(messageId, user.id, emoji)
  ctx.realtimeHub.publishReactionUpdated(message.conversationId, message.directThreadId, messageId, reactions)

  return json(ctx.corsOrigin, 200, {
    messageId,
    conversationId: message.conversationId,
    directThreadId: message.directThreadId,
    reactions
  })
}

export async function handleRemoveReaction(
  request: Request,
  messageId: string,
  emoji: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const message = await ctx.store.getMessageById(messageId)
  if (!message) {
    return error(ctx.corsOrigin, 404, "Message not found.")
  }

  const channel = await ctx.store.getChannelById(message.channelId)
  if (!channel) {
    return error(ctx.corsOrigin, 404, "Channel not found.")
  }

  if (!(await ctx.store.hasChannelPermission(channel.id, user.id, "read_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: read_messages.")
  }

  const normalizedEmoji = emoji.trim()
  if (!normalizedEmoji) {
    return error(ctx.corsOrigin, 400, "emoji is required.")
  }

  const reactions = await ctx.store.removeReaction(messageId, user.id, normalizedEmoji)
  ctx.realtimeHub.publishReactionUpdated(message.conversationId, message.directThreadId, messageId, reactions)

  return json(ctx.corsOrigin, 200, {
    messageId,
    conversationId: message.conversationId,
    directThreadId: message.directThreadId,
    reactions
  })
}
