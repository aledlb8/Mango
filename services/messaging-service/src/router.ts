import { createHealthResponse } from "@mango/contracts"
import {
  handleAddReaction,
  handleCreateMessage,
  handleDeleteMessage,
  handleListMessages,
  handleRemoveReaction,
  handleUpdateMessage
} from "./handlers/messages"
import { corsHeaders, error, json } from "./http/response"
import type { RouteContext } from "./router-context"

const channelMessagesRoute = /^\/v1\/channels\/([^/]+)\/messages$/
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

  const channelMessagesMatch = pathname.match(channelMessagesRoute)
  if (channelMessagesMatch?.[1] && request.method === "POST") {
    return await handleCreateMessage(request, channelMessagesMatch[1], ctx)
  }

  if (channelMessagesMatch?.[1] && request.method === "GET") {
    return await handleListMessages(request, channelMessagesMatch[1], ctx)
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
      "POST /v1/channels/:channelId/messages",
      "GET /v1/channels/:channelId/messages",
      "PATCH /v1/messages/:messageId",
      "DELETE /v1/messages/:messageId",
      "POST /v1/messages/:messageId/reactions",
      "DELETE /v1/messages/:messageId/reactions/:emoji"
    ]
  })
}
