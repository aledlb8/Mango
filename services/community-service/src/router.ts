import { createHealthResponse } from "@mango/contracts"
import { handleCreateChannel, handleListChannels } from "./handlers/channels"
import { handleCreateServerInvite, handleJoinServerInvite } from "./handlers/invites"
import { handleCreateModerationAction, handleListAuditLogs } from "./handlers/moderation"
import {
  handleAddServerMember,
  handleAssignRole,
  handleCreateRole,
  handleListServerMembers,
  handleListRoles,
  handleUpsertChannelOverwrite
} from "./handlers/permissions"
import { handleCreateServer, handleListServers } from "./handlers/servers"
import { corsHeaders, error, json } from "./http/response"
import type { RouteContext } from "./router-context"

const serverChannelsRoute = /^\/v1\/servers\/([^/]+)\/channels$/
const serverMembersRoute = /^\/v1\/servers\/([^/]+)\/members$/
const serverRolesRoute = /^\/v1\/servers\/([^/]+)\/roles$/
const serverRoleAssignRoute = /^\/v1\/servers\/([^/]+)\/roles\/assign$/
const serverInvitesRoute = /^\/v1\/servers\/([^/]+)\/invites$/
const serverModerationActionsRoute = /^\/v1\/servers\/([^/]+)\/moderation\/actions$/
const serverAuditLogsRoute = /^\/v1\/servers\/([^/]+)\/audit-logs$/
const channelOverwritesRoute = /^\/v1\/channels\/([^/]+)\/overwrites$/
const inviteJoinRoute = /^\/v1\/invites\/([^/]+)\/join$/

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

  if (pathname === "/v1/servers" && request.method === "POST") {
    return await handleCreateServer(request, ctx)
  }

  if (pathname === "/v1/servers" && request.method === "GET") {
    return await handleListServers(request, ctx)
  }

  const serverChannelsMatch = pathname.match(serverChannelsRoute)
  if (serverChannelsMatch?.[1] && request.method === "POST") {
    return await handleCreateChannel(request, serverChannelsMatch[1], ctx)
  }

  if (serverChannelsMatch?.[1] && request.method === "GET") {
    return await handleListChannels(request, serverChannelsMatch[1], ctx)
  }

  const serverMembersMatch = pathname.match(serverMembersRoute)
  if (serverMembersMatch?.[1] && request.method === "POST") {
    return await handleAddServerMember(request, serverMembersMatch[1], ctx)
  }

  if (serverMembersMatch?.[1] && request.method === "GET") {
    return await handleListServerMembers(request, serverMembersMatch[1], ctx)
  }

  const serverRolesMatch = pathname.match(serverRolesRoute)
  if (serverRolesMatch?.[1] && request.method === "GET") {
    return await handleListRoles(request, serverRolesMatch[1], ctx)
  }

  if (serverRolesMatch?.[1] && request.method === "POST") {
    return await handleCreateRole(request, serverRolesMatch[1], ctx)
  }

  const serverRoleAssignMatch = pathname.match(serverRoleAssignRoute)
  if (serverRoleAssignMatch?.[1] && request.method === "POST") {
    return await handleAssignRole(request, serverRoleAssignMatch[1], ctx)
  }

  const serverInvitesMatch = pathname.match(serverInvitesRoute)
  if (serverInvitesMatch?.[1] && request.method === "POST") {
    return await handleCreateServerInvite(request, serverInvitesMatch[1], ctx)
  }

  const serverModerationActionsMatch = pathname.match(serverModerationActionsRoute)
  if (serverModerationActionsMatch?.[1] && request.method === "POST") {
    return await handleCreateModerationAction(request, serverModerationActionsMatch[1], ctx)
  }

  const serverAuditLogsMatch = pathname.match(serverAuditLogsRoute)
  if (serverAuditLogsMatch?.[1] && request.method === "GET") {
    return await handleListAuditLogs(request, serverAuditLogsMatch[1], ctx)
  }

  const channelOverwritesMatch = pathname.match(channelOverwritesRoute)
  if (channelOverwritesMatch?.[1] && request.method === "PUT") {
    return await handleUpsertChannelOverwrite(request, channelOverwritesMatch[1], ctx)
  }

  const inviteJoinMatch = pathname.match(inviteJoinRoute)
  if (inviteJoinMatch?.[1] && request.method === "POST") {
    return await handleJoinServerInvite(request, inviteJoinMatch[1], ctx)
  }

  if (pathname.startsWith("/v1/")) {
    return error(ctx.corsOrigin, 404, "Route not found.")
  }

  return json(ctx.corsOrigin, 200, {
    service: ctx.service,
    message: "Community service is running.",
    routes: [
      "GET /health",
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
      "POST /v1/servers/:serverId/moderation/actions",
      "GET /v1/servers/:serverId/audit-logs",
      "PUT /v1/channels/:channelId/overwrites",
      "POST /v1/invites/:code/join"
    ]
  })
}
