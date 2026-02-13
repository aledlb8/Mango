import { createHealthResponse } from "@mango/contracts"
import {
  handleAddReaction,
  handleCreateMessage,
  handleDeleteMessage,
  handleListMessages,
  handleRemoveReaction,
  handleUpdateMessage
} from "./handlers/messages"
import {
  handleCreateDirectThread,
  handleCreateDirectThreadMessage,
  handleListDirectThreadMessages,
  handleListDirectThreads
} from "./handlers/direct-threads"
import {
  handleGetChannelReadMarker,
  handleGetDirectThreadReadMarker,
  handleUpsertChannelReadMarker,
  handleUpsertDirectThreadReadMarker
} from "./handlers/read-markers"
import { handleChannelTyping, handleDirectThreadTyping } from "./handlers/typing"
import { corsHeaders, error, json } from "./http/response"
import type { RouteContext } from "./router-context"

const directThreadsRoute = /^\/v1\/direct-threads$/
const directThreadMessagesRoute = /^\/v1\/direct-threads\/([^/]+)\/messages$/
const directThreadReadMarkerRoute = /^\/v1\/direct-threads\/([^/]+)\/read-marker$/
const directThreadTypingRoute = /^\/v1\/direct-threads\/([^/]+)\/typing$/
const channelMessagesRoute = /^\/v1\/channels\/([^/]+)\/messages$/
const channelReadMarkerRoute = /^\/v1\/channels\/([^/]+)\/read-marker$/
const channelTypingRoute = /^\/v1\/channels\/([^/]+)\/typing$/
const messageRoute = /^\/v1\/messages\/([^/]+)$/
const messageReactionsRoute = /^\/v1\/messages\/([^/]+)\/reactions$/
const messageReactionRoute = /^\/v1\/messages\/([^/]+)\/reactions\/([^/]+)$/

export async function routeRequest(request: Request, ctx: RouteContext): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(ctx.corsOrigin)
    })
  }

  const { pathname } = new URL(request.url)

  if (pathname === "/health" && request.method === "GET") {
    return json(ctx.corsOrigin, 200, createHealthResponse(ctx.service))
  }

  if (directThreadsRoute.test(pathname) && request.method === "POST") {
    return await handleCreateDirectThread(request, ctx)
  }

  if (directThreadsRoute.test(pathname) && request.method === "GET") {
    return await handleListDirectThreads(request, ctx)
  }

  const directThreadMessagesMatch = pathname.match(directThreadMessagesRoute)
  if (directThreadMessagesMatch?.[1] && request.method === "POST") {
    return await handleCreateDirectThreadMessage(request, directThreadMessagesMatch[1], ctx)
  }

  if (directThreadMessagesMatch?.[1] && request.method === "GET") {
    return await handleListDirectThreadMessages(request, directThreadMessagesMatch[1], ctx)
  }

  const directThreadReadMarkerMatch = pathname.match(directThreadReadMarkerRoute)
  if (directThreadReadMarkerMatch?.[1] && request.method === "GET") {
    return await handleGetDirectThreadReadMarker(request, directThreadReadMarkerMatch[1], ctx)
  }

  if (directThreadReadMarkerMatch?.[1] && request.method === "PUT") {
    return await handleUpsertDirectThreadReadMarker(request, directThreadReadMarkerMatch[1], ctx)
  }

  const directThreadTypingMatch = pathname.match(directThreadTypingRoute)
  if (directThreadTypingMatch?.[1] && request.method === "POST") {
    return await handleDirectThreadTyping(request, directThreadTypingMatch[1], ctx)
  }

  const channelMessagesMatch = pathname.match(channelMessagesRoute)
  if (channelMessagesMatch?.[1] && request.method === "POST") {
    return await handleCreateMessage(request, channelMessagesMatch[1], ctx)
  }

  if (channelMessagesMatch?.[1] && request.method === "GET") {
    return await handleListMessages(request, channelMessagesMatch[1], ctx)
  }

  const channelReadMarkerMatch = pathname.match(channelReadMarkerRoute)
  if (channelReadMarkerMatch?.[1] && request.method === "GET") {
    return await handleGetChannelReadMarker(request, channelReadMarkerMatch[1], ctx)
  }

  if (channelReadMarkerMatch?.[1] && request.method === "PUT") {
    return await handleUpsertChannelReadMarker(request, channelReadMarkerMatch[1], ctx)
  }

  const channelTypingMatch = pathname.match(channelTypingRoute)
  if (channelTypingMatch?.[1] && request.method === "POST") {
    return await handleChannelTyping(request, channelTypingMatch[1], ctx)
  }

  const messageMatch = pathname.match(messageRoute)
  if (messageMatch?.[1] && request.method === "PATCH") {
    return await handleUpdateMessage(request, messageMatch[1], ctx)
  }

  if (messageMatch?.[1] && request.method === "DELETE") {
    return await handleDeleteMessage(request, messageMatch[1], ctx)
  }

  const messageReactionsMatch = pathname.match(messageReactionsRoute)
  if (messageReactionsMatch?.[1] && request.method === "POST") {
    return await handleAddReaction(request, messageReactionsMatch[1], ctx)
  }

  const messageReactionMatch = pathname.match(messageReactionRoute)
  if (messageReactionMatch?.[1] && messageReactionMatch?.[2] && request.method === "DELETE") {
    let emoji = messageReactionMatch[2]
    try {
      emoji = decodeURIComponent(emoji)
    } catch {
      return error(ctx.corsOrigin, 400, "Invalid emoji path segment.")
    }

    return await handleRemoveReaction(request, messageReactionMatch[1], emoji, ctx)
  }

  if (pathname.startsWith("/v1/")) {
    return error(ctx.corsOrigin, 404, "Route not found.")
  }

  return json(ctx.corsOrigin, 200, {
    service: ctx.service,
    message: "Messaging service is running.",
    routes: [
      "GET /health",
      "POST /v1/direct-threads",
      "GET /v1/direct-threads",
      "POST /v1/direct-threads/:threadId/messages",
      "GET /v1/direct-threads/:threadId/messages",
      "GET /v1/direct-threads/:threadId/read-marker",
      "PUT /v1/direct-threads/:threadId/read-marker",
      "POST /v1/direct-threads/:threadId/typing",
      "POST /v1/channels/:channelId/messages",
      "GET /v1/channels/:channelId/messages",
      "GET /v1/channels/:channelId/read-marker",
      "PUT /v1/channels/:channelId/read-marker",
      "POST /v1/channels/:channelId/typing",
      "PATCH /v1/messages/:messageId",
      "DELETE /v1/messages/:messageId",
      "POST /v1/messages/:messageId/reactions",
      "DELETE /v1/messages/:messageId/reactions/:emoji"
    ]
  })
}
