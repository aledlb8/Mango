import type { Message, MessageDeletedEvent, MessageReactionSummary } from "@mango/contracts"
import { createHealthResponse } from "@mango/contracts"
import {
  communityServiceUrl,
  identityServiceUrl,
  messagingServiceUrl,
  preferCommunityServiceProxy,
  preferIdentityServiceProxy,
  preferMessagingServiceProxy
} from "./config"
import { handleGetMe, handleLogin, handleRegister } from "./handlers/auth"
import { handleCreateChannel, handleListChannels } from "./handlers/channels"
import { handleCreateServerInvite, handleJoinServerInvite } from "./handlers/invites"
import {
  handleAddReaction,
  handleCreateMessage,
  handleDeleteMessage,
  handleListMessages,
  handleRemoveReaction,
  handleUpdateMessage
} from "./handlers/messages"
import {
  handleAddServerMember,
  handleAssignRole,
  handleCreateRole,
  handleListServerMembers,
  handleListRoles,
  handleUpsertChannelOverwrite
} from "./handlers/permissions"
import { handleAddFriend, handleGetUserById, handleListFriends, handleSearchUsers } from "./handlers/social"
import { handleCreateServer, handleListServers } from "./handlers/servers"
import { corsHeaders, error, json } from "./http/response"
import type { RouteContext } from "./router-context"

const serverChannelsRoute = /^\/v1\/servers\/([^/]+)\/channels$/
const serverMembersRoute = /^\/v1\/servers\/([^/]+)\/members$/
const serverRolesRoute = /^\/v1\/servers\/([^/]+)\/roles$/
const serverRoleAssignRoute = /^\/v1\/servers\/([^/]+)\/roles\/assign$/
const serverInvitesRoute = /^\/v1\/servers\/([^/]+)\/invites$/
const channelMessagesRoute = /^\/v1\/channels\/([^/]+)\/messages$/
const channelOverwritesRoute = /^\/v1\/channels\/([^/]+)\/overwrites$/
const messageRoute = /^\/v1\/messages\/([^/]+)$/
const messageReactionsRoute = /^\/v1\/messages\/([^/]+)\/reactions$/
const messageReactionRoute = /^\/v1\/messages\/([^/]+)\/reactions\/([^/]+)$/
const inviteJoinRoute = /^\/v1\/invites\/([^/]+)\/join$/
const friendsRoute = /^\/v1\/friends$/
const userRoute = /^\/v1\/users\/([^/]+)$/

type ReactionResponse = {
  messageId: string
  reactions: MessageReactionSummary[]
}

function shouldProxyIdentity(_ctx: RouteContext): boolean {
  return preferIdentityServiceProxy
}

function shouldProxyCommunity(_ctx: RouteContext): boolean {
  return preferCommunityServiceProxy
}

function shouldProxyMessaging(_ctx: RouteContext): boolean {
  return preferMessagingServiceProxy
}

async function proxyToService(
  baseUrl: string,
  request: Request,
  ctx: RouteContext
): Promise<Response | null> {
  const sourceUrl = new URL(request.url)
  const targetUrl = `${baseUrl}${sourceUrl.pathname}${sourceUrl.search}`

  const headers: Record<string, string> = {}
  const contentType = request.headers.get("content-type")
  if (contentType) {
    headers["Content-Type"] = contentType
  }

  const authorization = request.headers.get("authorization")
  if (authorization) {
    headers.Authorization = authorization
  }

  const cookie = request.headers.get("cookie")
  if (cookie) {
    headers.Cookie = cookie
  }

  const method = request.method.toUpperCase()
  const sendBody = !["GET", "HEAD", "OPTIONS"].includes(method)
  const body = sendBody ? await request.clone().text() : undefined

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body
    })

    const payload = await upstream.text()
    const responseHeaders = corsHeaders(ctx.corsOrigin)
    const upstreamContentType = upstream.headers.get("content-type")
    if (upstreamContentType && typeof responseHeaders === "object" && responseHeaders !== null) {
      ;(responseHeaders as Record<string, string>)["Content-Type"] = upstreamContentType
    }

    return new Response(payload, {
      status: upstream.status,
      headers: responseHeaders
    })
  } catch {
    return null
  }
}

async function parseProxiedJson<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type")
  if (!contentType || !contentType.toLowerCase().includes("application/json")) {
    return null
  }

  try {
    return (await response.clone().json()) as T
  } catch {
    return null
  }
}

async function publishRealtimeFromMessagingProxy(
  pathname: string,
  method: string,
  response: Response,
  ctx: RouteContext
): Promise<void> {
  if (!response.ok) {
    return
  }

  const upperMethod = method.toUpperCase()

  if (upperMethod === "POST" && channelMessagesRoute.test(pathname)) {
    const payload = await parseProxiedJson<Message>(response)
    if (payload) {
      ctx.realtimeHub.publishMessageCreated(payload)
    }
    return
  }

  if (upperMethod === "PATCH" && messageRoute.test(pathname)) {
    const payload = await parseProxiedJson<Message>(response)
    if (payload) {
      ctx.realtimeHub.publishMessageUpdated(payload)
    }
    return
  }

  if (upperMethod === "DELETE" && messageRoute.test(pathname)) {
    const payload = await parseProxiedJson<MessageDeletedEvent>(response)
    if (payload) {
      ctx.realtimeHub.publishMessageDeleted(payload)
    }
    return
  }

  if (
    (upperMethod === "POST" && messageReactionsRoute.test(pathname)) ||
    (upperMethod === "DELETE" && messageReactionRoute.test(pathname))
  ) {
    const payload = await parseProxiedJson<ReactionResponse>(response)
    if (!payload?.messageId || !Array.isArray(payload.reactions)) {
      return
    }

    const message = await ctx.store.getMessageById(payload.messageId)
    if (!message) {
      return
    }

    ctx.realtimeHub.publishReactionUpdated(message.channelId, payload.messageId, payload.reactions)
  }
}

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

  if (pathname === "/v1/auth/register" && request.method === "POST") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleRegister(request, ctx)
  }

  if (pathname === "/v1/auth/login" && request.method === "POST") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleLogin(request, ctx)
  }

  if (pathname === "/v1/me" && request.method === "GET") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleGetMe(request, ctx)
  }

  if (pathname === "/v1/servers" && request.method === "POST") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleCreateServer(request, ctx)
  }

  if (pathname === "/v1/servers" && request.method === "GET") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleListServers(request, ctx)
  }

  if (pathname === "/v1/users/search" && request.method === "GET") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleSearchUsers(request, ctx)
  }

  const userMatch = pathname.match(userRoute)
  if (userMatch?.[1] && request.method === "GET") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleGetUserById(request, userMatch[1], ctx)
  }

  if (friendsRoute.test(pathname) && request.method === "GET") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleListFriends(request, ctx)
  }

  if (friendsRoute.test(pathname) && request.method === "POST") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleAddFriend(request, ctx)
  }

  const serverChannelsMatch = pathname.match(serverChannelsRoute)
  if (serverChannelsMatch?.[1] && request.method === "POST") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleCreateChannel(request, serverChannelsMatch[1], ctx)
  }

  if (serverChannelsMatch?.[1] && request.method === "GET") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleListChannels(request, serverChannelsMatch[1], ctx)
  }

  const serverMembersMatch = pathname.match(serverMembersRoute)
  if (serverMembersMatch?.[1] && request.method === "POST") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleAddServerMember(request, serverMembersMatch[1], ctx)
  }

  if (serverMembersMatch?.[1] && request.method === "GET") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleListServerMembers(request, serverMembersMatch[1], ctx)
  }

  const serverRolesMatch = pathname.match(serverRolesRoute)
  if (serverRolesMatch?.[1] && request.method === "GET") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleListRoles(request, serverRolesMatch[1], ctx)
  }

  if (serverRolesMatch?.[1] && request.method === "POST") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleCreateRole(request, serverRolesMatch[1], ctx)
  }

  const serverRoleAssignMatch = pathname.match(serverRoleAssignRoute)
  if (serverRoleAssignMatch?.[1] && request.method === "POST") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleAssignRole(request, serverRoleAssignMatch[1], ctx)
  }

  const serverInvitesMatch = pathname.match(serverInvitesRoute)
  if (serverInvitesMatch?.[1] && request.method === "POST") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleCreateServerInvite(request, serverInvitesMatch[1], ctx)
  }

  const channelMessagesMatch = pathname.match(channelMessagesRoute)
  if (channelMessagesMatch?.[1] && request.method === "POST") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        await publishRealtimeFromMessagingProxy(pathname, request.method, proxied, ctx)
        return proxied
      }
    }
    return await handleCreateMessage(request, channelMessagesMatch[1], ctx)
  }

  if (channelMessagesMatch?.[1] && request.method === "GET") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleListMessages(request, channelMessagesMatch[1], ctx)
  }

  const channelOverwritesMatch = pathname.match(channelOverwritesRoute)
  if (channelOverwritesMatch?.[1] && request.method === "PUT") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleUpsertChannelOverwrite(request, channelOverwritesMatch[1], ctx)
  }

  const messageMatch = pathname.match(messageRoute)
  if (messageMatch?.[1] && request.method === "PATCH") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        await publishRealtimeFromMessagingProxy(pathname, request.method, proxied, ctx)
        return proxied
      }
    }
    return await handleUpdateMessage(request, messageMatch[1], ctx)
  }

  if (messageMatch?.[1] && request.method === "DELETE") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        await publishRealtimeFromMessagingProxy(pathname, request.method, proxied, ctx)
        return proxied
      }
    }
    return await handleDeleteMessage(request, messageMatch[1], ctx)
  }

  const messageReactionsMatch = pathname.match(messageReactionsRoute)
  if (messageReactionsMatch?.[1] && request.method === "POST") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        await publishRealtimeFromMessagingProxy(pathname, request.method, proxied, ctx)
        return proxied
      }
    }
    return await handleAddReaction(request, messageReactionsMatch[1], ctx)
  }

  const messageReactionMatch = pathname.match(messageReactionRoute)
  if (messageReactionMatch?.[1] && messageReactionMatch?.[2] && request.method === "DELETE") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        await publishRealtimeFromMessagingProxy(pathname, request.method, proxied, ctx)
        return proxied
      }
    }

    let emoji = messageReactionMatch[2]
    try {
      emoji = decodeURIComponent(emoji)
    } catch {
      return error(ctx.corsOrigin, 400, "Invalid emoji path segment.")
    }

    return await handleRemoveReaction(request, messageReactionMatch[1], emoji, ctx)
  }

  const inviteJoinMatch = pathname.match(inviteJoinRoute)
  if (inviteJoinMatch?.[1] && request.method === "POST") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleJoinServerInvite(request, inviteJoinMatch[1], ctx)
  }

  return json(ctx.corsOrigin, 200, {
    service: ctx.service,
    message: "Mango API gateway is running.",
    routes: [
      "GET /health",
      "POST /v1/auth/register",
      "POST /v1/auth/login",
      "GET /v1/me",
      "GET /v1/users/search?q=term",
      "GET /v1/users/:userId",
      "GET /v1/friends",
      "POST /v1/friends",
      "POST /v1/servers",
      "GET /v1/servers",
      "POST /v1/servers/:serverId/channels",
      "GET /v1/servers/:serverId/channels",
      "POST /v1/servers/:serverId/members",
      "GET /v1/servers/:serverId/members",
      "GET /v1/servers/:serverId/roles",
      "POST /v1/servers/:serverId/roles",
      "POST /v1/servers/:serverId/roles/assign",
      "POST /v1/servers/:serverId/invites",
      "POST /v1/channels/:channelId/messages",
      "GET /v1/channels/:channelId/messages",
      "PUT /v1/channels/:channelId/overwrites",
      "PATCH /v1/messages/:messageId",
      "DELETE /v1/messages/:messageId",
      "POST /v1/messages/:messageId/reactions",
      "DELETE /v1/messages/:messageId/reactions/:emoji",
      "POST /v1/invites/:code/join",
      "GET /v1/ws?token=..."
    ]
  })
}
