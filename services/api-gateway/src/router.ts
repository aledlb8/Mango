import type {
  DirectThread,
  Message,
  MessageDeletedEvent,
  MessageReactionSummary,
  PresenceState,
  TypingIndicator
} from "@mango/contracts"
import { createHealthResponse } from "@mango/contracts"
import {
  communityServiceUrl,
  identityServiceUrl,
  mediaServiceUrl,
  messagingServiceUrl,
  presenceServiceUrl,
  preferCommunityServiceProxy,
  preferIdentityServiceProxy,
  preferMediaServiceProxy,
  preferMessagingServiceProxy,
  preferPresenceServiceProxy
} from "./config"
import { handleGetMe, handleLogin, handleRegister } from "./handlers/auth"
import {
  handleCreateChannel,
  handleDeleteChannel,
  handleListChannels,
  handleUpdateChannel
} from "./handlers/channels"
import {
  handleCreateDirectThread,
  handleCreateDirectThreadMessage,
  handleLeaveDirectThread,
  handleListDirectThreadMessages,
  handleListDirectThreads
} from "./handlers/direct-threads"
import { handleCreateServerInvite, handleJoinServerInvite } from "./handlers/invites"
import { handleCreateModerationAction, handleListAuditLogs } from "./handlers/moderation"
import {
  handleAddReaction,
  handleCreateMessage,
  handleDeleteMessage,
  handleListMessages,
  handleRemoveReaction,
  handleUpdateMessage
} from "./handlers/messages"
import { enqueueMessageNotificationsBestEffort } from "./handlers/notification-dispatch"
import {
  handleCreatePushSubscription,
  handleDeletePushSubscription,
  handleListPushSubscriptions
} from "./handlers/notifications"
import {
  handleAddServerMember,
  handleAssignRole,
  handleCreateRole,
  handleListServerMembers,
  handleListRoles,
  handleUpsertChannelOverwrite
} from "./handlers/permissions"
import {
  handleGetChannelReadMarker,
  handleGetDirectThreadReadMarker,
  handleUpsertChannelReadMarker,
  handleUpsertDirectThreadReadMarker
} from "./handlers/read-markers"
import {
  handleCreateFriendRequest,
  handleGetUserById,
  handleListFriendRequests,
  handleListFriends,
  handleRemoveFriend,
  handleRespondFriendRequest,
  handleSearchUsers
} from "./handlers/social"
import {
  handleCreateServer,
  handleDeleteServer,
  handleLeaveServer,
  handleListServers
} from "./handlers/servers"
import { handleSearch } from "./handlers/search"
import { handleChannelTyping, handleDirectThreadTyping } from "./handlers/typing"
import { corsHeaders, error, json } from "./http/response"
import { checkRateLimit } from "./rate-limit"
import type { RouteContext } from "./router-context"

const serverChannelsRoute = /^\/v1\/servers\/([^/]+)\/channels$/
const serverRoute = /^\/v1\/servers\/([^/]+)$/
const serverLeaveRoute = /^\/v1\/servers\/([^/]+)\/members\/@me$/
const serverMembersRoute = /^\/v1\/servers\/([^/]+)\/members$/
const serverRolesRoute = /^\/v1\/servers\/([^/]+)\/roles$/
const serverRoleAssignRoute = /^\/v1\/servers\/([^/]+)\/roles\/assign$/
const serverInvitesRoute = /^\/v1\/servers\/([^/]+)\/invites$/
const serverModerationActionsRoute = /^\/v1\/servers\/([^/]+)\/moderation\/actions$/
const serverAuditLogsRoute = /^\/v1\/servers\/([^/]+)\/audit-logs$/
const directThreadsRoute = /^\/v1\/direct-threads$/
const directThreadLeaveRoute = /^\/v1\/direct-threads\/([^/]+)\/participants\/@me$/
const directThreadMessagesRoute = /^\/v1\/direct-threads\/([^/]+)\/messages$/
const directThreadReadMarkerRoute = /^\/v1\/direct-threads\/([^/]+)\/read-marker$/
const directThreadTypingRoute = /^\/v1\/direct-threads\/([^/]+)\/typing$/
const channelMessagesRoute = /^\/v1\/channels\/([^/]+)\/messages$/
const channelReadMarkerRoute = /^\/v1\/channels\/([^/]+)\/read-marker$/
const channelTypingRoute = /^\/v1\/channels\/([^/]+)\/typing$/
const channelOverwritesRoute = /^\/v1\/channels\/([^/]+)\/overwrites$/
const channelRoute = /^\/v1\/channels\/([^/]+)$/
const messageRoute = /^\/v1\/messages\/([^/]+)$/
const messageReactionsRoute = /^\/v1\/messages\/([^/]+)\/reactions$/
const messageReactionRoute = /^\/v1\/messages\/([^/]+)\/reactions\/([^/]+)$/
const inviteJoinRoute = /^\/v1\/invites\/([^/]+)\/join$/
const friendsRoute = /^\/v1\/friends$/
const friendRoute = /^\/v1\/friends\/([^/]+)$/
const friendRequestsRoute = /^\/v1\/friends\/requests$/
const friendRequestRoute = /^\/v1\/friends\/requests\/([^/]+)$/
const pushSubscriptionsRoute = /^\/v1\/notifications\/push-subscriptions$/
const pushSubscriptionRoute = /^\/v1\/notifications\/push-subscriptions\/([^/]+)$/
const userRoute = /^\/v1\/users\/([^/]+)$/
const attachmentsRoute = /^\/v1\/attachments$/
const presenceRoute = /^\/v1\/presence$/
const presenceMeRoute = /^\/v1\/presence\/me$/
const presenceBulkRoute = /^\/v1\/presence\/bulk$/
const presenceUserRoute = /^\/v1\/presence\/([^/]+)$/

type ReactionResponse = {
  messageId: string
  conversationId?: string
  directThreadId?: string | null
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

function shouldProxyMedia(_ctx: RouteContext): boolean {
  return preferMediaServiceProxy
}

function shouldProxyPresence(_ctx: RouteContext): boolean {
  return preferPresenceServiceProxy
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

  if (upperMethod === "POST" && directThreadsRoute.test(pathname)) {
    const payload = await parseProxiedJson<DirectThread>(response)
    if (payload) {
      ctx.realtimeHub.publishDirectThreadCreated(payload)
    }
    return
  }

  if (
    upperMethod === "POST" &&
    (channelMessagesRoute.test(pathname) || directThreadMessagesRoute.test(pathname))
  ) {
    const payload = await parseProxiedJson<Message>(response)
    if (payload) {
      let recipients: string[] = []
      if (payload.directThreadId) {
        const thread = await ctx.store.getDirectThreadById(payload.directThreadId)
        recipients = thread?.participantIds ?? []
      }

      ctx.realtimeHub.publishMessageCreated(payload, recipients)
      await enqueueMessageNotificationsBestEffort(payload, ctx)
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

    ctx.realtimeHub.publishReactionUpdated(
      payload.conversationId ?? message.conversationId,
      payload.directThreadId ?? message.directThreadId,
      payload.messageId,
      payload.reactions
    )
    return
  }

  if (
    upperMethod === "POST" &&
    (channelTypingRoute.test(pathname) || directThreadTypingRoute.test(pathname))
  ) {
    const payload = await parseProxiedJson<TypingIndicator>(response)
    if (!payload) {
      return
    }

    ctx.realtimeHub.publishTypingUpdated(payload.conversationId, payload)
  }
}

async function publishRealtimeFromPresenceProxy(
  pathname: string,
  method: string,
  response: Response,
  ctx: RouteContext
): Promise<void> {
  if (!response.ok) {
    return
  }

  const upperMethod = method.toUpperCase()
  if (!(upperMethod === "PUT" && presenceRoute.test(pathname))) {
    return
  }

  const payload = await parseProxiedJson<PresenceState>(response)
  if (!payload?.userId) {
    return
  }

  const friends = await ctx.store.listFriends(payload.userId)
  ctx.realtimeHub.publishPresenceUpdated(
    payload,
    friends.map((friend) => friend.id)
  )
}

export async function routeRequest(request: Request, ctx: RouteContext): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(ctx.corsOrigin)
    })
  }

  const { pathname } = new URL(request.url)

  const rateLimit = checkRateLimit(request)
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
      status: 429,
      headers: {
        ...corsHeaders(ctx.corsOrigin),
        "Content-Type": "application/json",
        "Retry-After": String(rateLimit.retryAfterSeconds)
      }
    })
  }

  if (pathname === "/health" && request.method === "GET") {
    return json(ctx.corsOrigin, 200, createHealthResponse(ctx.service))
  }

  if (
    (presenceRoute.test(pathname) && request.method === "PUT") ||
    (presenceMeRoute.test(pathname) && request.method === "GET") ||
    (presenceBulkRoute.test(pathname) && request.method === "POST") ||
    (presenceUserRoute.test(pathname) && request.method === "GET")
  ) {
    if (shouldProxyPresence(ctx)) {
      const proxied = await proxyToService(presenceServiceUrl, request, ctx)
      if (proxied) {
        await publishRealtimeFromPresenceProxy(pathname, request.method, proxied, ctx)
        return proxied
      }
    }

    return error(ctx.corsOrigin, 503, "Presence service unavailable.")
  }

  if (attachmentsRoute.test(pathname) && request.method === "POST") {
    if (shouldProxyMedia(ctx)) {
      const proxied = await proxyToService(mediaServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }

    return error(ctx.corsOrigin, 503, "Media service unavailable.")
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

  const serverMatch = pathname.match(serverRoute)
  if (serverMatch?.[1] && request.method === "DELETE") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleDeleteServer(request, serverMatch[1], ctx)
  }

  const serverLeaveMatch = pathname.match(serverLeaveRoute)
  if (serverLeaveMatch?.[1] && request.method === "DELETE") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleLeaveServer(request, serverLeaveMatch[1], ctx)
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
    return await handleCreateFriendRequest(request, ctx)
  }

  if (friendRequestsRoute.test(pathname) && request.method === "GET") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleListFriendRequests(request, ctx)
  }

  if (friendRequestsRoute.test(pathname) && request.method === "POST") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleCreateFriendRequest(request, ctx)
  }

  const friendRequestMatch = pathname.match(friendRequestRoute)
  if (friendRequestMatch?.[1] && request.method === "POST") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleRespondFriendRequest(request, friendRequestMatch[1], ctx)
  }

  const friendMatch = pathname.match(friendRoute)
  if (friendMatch?.[1] && friendMatch[1] !== "requests" && request.method === "DELETE") {
    if (shouldProxyIdentity(ctx)) {
      const proxied = await proxyToService(identityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleRemoveFriend(request, friendMatch[1], ctx)
  }

  if (pathname === "/v1/search" && request.method === "GET") {
    return await handleSearch(request, ctx)
  }

  if (pushSubscriptionsRoute.test(pathname) && request.method === "POST") {
    return await handleCreatePushSubscription(request, ctx)
  }

  if (pushSubscriptionsRoute.test(pathname) && request.method === "GET") {
    return await handleListPushSubscriptions(request, ctx)
  }

  const pushSubscriptionMatch = pathname.match(pushSubscriptionRoute)
  if (pushSubscriptionMatch?.[1] && request.method === "DELETE") {
    return await handleDeletePushSubscription(request, pushSubscriptionMatch[1], ctx)
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

  const serverModerationActionsMatch = pathname.match(serverModerationActionsRoute)
  if (serverModerationActionsMatch?.[1] && request.method === "POST") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied && proxied.status !== 404) {
        return proxied
      }
    }
    return await handleCreateModerationAction(request, serverModerationActionsMatch[1], ctx)
  }

  const serverAuditLogsMatch = pathname.match(serverAuditLogsRoute)
  if (serverAuditLogsMatch?.[1] && request.method === "GET") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied && proxied.status !== 404) {
        return proxied
      }
    }
    return await handleListAuditLogs(request, serverAuditLogsMatch[1], ctx)
  }

  if (directThreadsRoute.test(pathname) && request.method === "POST") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        await publishRealtimeFromMessagingProxy(pathname, request.method, proxied, ctx)
        return proxied
      }
    }
    return await handleCreateDirectThread(request, ctx)
  }

  if (directThreadsRoute.test(pathname) && request.method === "GET") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleListDirectThreads(request, ctx)
  }

  const directThreadLeaveMatch = pathname.match(directThreadLeaveRoute)
  if (directThreadLeaveMatch?.[1] && request.method === "DELETE") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleLeaveDirectThread(request, directThreadLeaveMatch[1], ctx)
  }

  const directThreadMessagesMatch = pathname.match(directThreadMessagesRoute)
  if (directThreadMessagesMatch?.[1] && request.method === "POST") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        await publishRealtimeFromMessagingProxy(pathname, request.method, proxied, ctx)
        return proxied
      }
    }
    return await handleCreateDirectThreadMessage(request, directThreadMessagesMatch[1], ctx)
  }

  if (directThreadMessagesMatch?.[1] && request.method === "GET") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleListDirectThreadMessages(request, directThreadMessagesMatch[1], ctx)
  }

  const directThreadReadMarkerMatch = pathname.match(directThreadReadMarkerRoute)
  if (directThreadReadMarkerMatch?.[1] && request.method === "GET") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleGetDirectThreadReadMarker(request, directThreadReadMarkerMatch[1], ctx)
  }

  if (directThreadReadMarkerMatch?.[1] && request.method === "PUT") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleUpsertDirectThreadReadMarker(request, directThreadReadMarkerMatch[1], ctx)
  }

  const directThreadTypingMatch = pathname.match(directThreadTypingRoute)
  if (directThreadTypingMatch?.[1] && request.method === "POST") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        await publishRealtimeFromMessagingProxy(pathname, request.method, proxied, ctx)
        return proxied
      }
    }
    return await handleDirectThreadTyping(request, directThreadTypingMatch[1], ctx)
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

  const channelReadMarkerMatch = pathname.match(channelReadMarkerRoute)
  if (channelReadMarkerMatch?.[1] && request.method === "GET") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleGetChannelReadMarker(request, channelReadMarkerMatch[1], ctx)
  }

  if (channelReadMarkerMatch?.[1] && request.method === "PUT") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleUpsertChannelReadMarker(request, channelReadMarkerMatch[1], ctx)
  }

  const channelTypingMatch = pathname.match(channelTypingRoute)
  if (channelTypingMatch?.[1] && request.method === "POST") {
    if (shouldProxyMessaging(ctx)) {
      const proxied = await proxyToService(messagingServiceUrl, request, ctx)
      if (proxied) {
        await publishRealtimeFromMessagingProxy(pathname, request.method, proxied, ctx)
        return proxied
      }
    }
    return await handleChannelTyping(request, channelTypingMatch[1], ctx)
  }

  const channelMatch = pathname.match(channelRoute)
  if (channelMatch?.[1] && request.method === "PATCH") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleUpdateChannel(request, channelMatch[1], ctx)
  }

  if (channelMatch?.[1] && request.method === "DELETE") {
    if (shouldProxyCommunity(ctx)) {
      const proxied = await proxyToService(communityServiceUrl, request, ctx)
      if (proxied) {
        return proxied
      }
    }
    return await handleDeleteChannel(request, channelMatch[1], ctx)
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
      "POST /v1/attachments",
      "POST /v1/auth/register",
      "POST /v1/auth/login",
      "GET /v1/me",
      "PUT /v1/presence",
      "GET /v1/presence/me",
      "POST /v1/presence/bulk",
      "GET /v1/presence/:userId",
      "GET /v1/users/search?q=term",
      "GET /v1/users/:userId",
      "GET /v1/friends",
      "POST /v1/friends",
      "DELETE /v1/friends/:friendUserId",
      "GET /v1/friends/requests",
      "POST /v1/friends/requests",
      "POST /v1/friends/requests/:requestId",
      "GET /v1/search?q=term",
      "POST /v1/notifications/push-subscriptions",
      "GET /v1/notifications/push-subscriptions",
      "DELETE /v1/notifications/push-subscriptions/:subscriptionId",
      "POST /v1/servers",
      "GET /v1/servers",
      "DELETE /v1/servers/:serverId",
      "DELETE /v1/servers/:serverId/members/@me",
      "POST /v1/servers/:serverId/channels",
      "GET /v1/servers/:serverId/channels",
      "POST /v1/servers/:serverId/members",
      "GET /v1/servers/:serverId/members",
      "GET /v1/servers/:serverId/roles",
      "POST /v1/servers/:serverId/roles",
      "POST /v1/servers/:serverId/roles/assign",
      "POST /v1/servers/:serverId/invites",
      "POST /v1/servers/:serverId/moderation/actions",
      "GET /v1/servers/:serverId/audit-logs",
      "POST /v1/direct-threads",
      "GET /v1/direct-threads",
      "DELETE /v1/direct-threads/:threadId/participants/@me",
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
      "PATCH /v1/channels/:channelId",
      "DELETE /v1/channels/:channelId",
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
