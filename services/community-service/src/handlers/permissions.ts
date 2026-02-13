import type {
  AddServerMemberRequest,
  AssignRoleRequest,
  CreateRoleRequest,
  Role,
  UpsertChannelOverwriteRequest
} from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"

export async function handleListRoles(
  request: Request,
  serverId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const server = await ctx.store.getServerById(serverId)
  if (!server) {
    return error(ctx.corsOrigin, 404, "Server not found.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const roles = await ctx.store.listRoles(serverId)
  return json(ctx.corsOrigin, 200, roles)
}

export async function handleListServerMembers(
  request: Request,
  serverId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const server = await ctx.store.getServerById(serverId)
  if (!server) {
    return error(ctx.corsOrigin, 404, "Server not found.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const members = await ctx.store.listServerMembers(serverId)
  return json(ctx.corsOrigin, 200, members)
}

export async function handleCreateRole(
  request: Request,
  serverId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const server = await ctx.store.getServerById(serverId)
  if (!server) {
    return error(ctx.corsOrigin, 404, "Server not found.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const body = await readJson<CreateRoleRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const name = body.name?.trim()
  if (!name || name.length < 2) {
    return error(ctx.corsOrigin, 400, "Role name must be at least 2 characters.")
  }

  const role: Role = await ctx.store.createRole(serverId, name, body.permissions ?? [])
  return json(ctx.corsOrigin, 201, role)
}

export async function handleAssignRole(
  request: Request,
  serverId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const server = await ctx.store.getServerById(serverId)
  if (!server) {
    return error(ctx.corsOrigin, 404, "Server not found.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const body = await readJson<AssignRoleRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  if (!body.roleId || !body.memberId) {
    return error(ctx.corsOrigin, 400, "roleId and memberId are required.")
  }

  const role = await ctx.store.getRoleById(body.roleId)
  if (!role || role.serverId !== serverId) {
    return error(ctx.corsOrigin, 404, "Role not found in this server.")
  }

  if (!(await ctx.store.isServerMember(serverId, body.memberId))) {
    return error(ctx.corsOrigin, 404, "Member not found in this server.")
  }

  await ctx.store.assignRole(serverId, body.roleId, body.memberId)
  return json(ctx.corsOrigin, 200, { status: "ok" })
}

export async function handleAddServerMember(
  request: Request,
  serverId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const server = await ctx.store.getServerById(serverId)
  if (!server) {
    return error(ctx.corsOrigin, 404, "Server not found.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const body = await readJson<AddServerMemberRequest>(request)
  if (!body || !body.memberId) {
    return error(ctx.corsOrigin, 400, "memberId is required.")
  }

  const member = await ctx.store.findUserById(body.memberId)
  if (!member) {
    return error(ctx.corsOrigin, 404, "User not found.")
  }

  try {
    await ctx.store.addServerMember(serverId, member.id)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message.toLowerCase() : ""
    if (message.includes("banned")) {
      return error(ctx.corsOrigin, 403, "User is banned from this server.")
    }
    throw reason
  }
  return json(ctx.corsOrigin, 200, { status: "ok" })
}

export async function handleUpsertChannelOverwrite(
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

  const body = await readJson<UpsertChannelOverwriteRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  if (!body.targetId || !body.targetType) {
    return error(ctx.corsOrigin, 400, "targetType and targetId are required.")
  }

  if (!["role", "member"].includes(body.targetType)) {
    return error(ctx.corsOrigin, 400, "targetType must be 'role' or 'member'.")
  }

  if (body.targetType === "role") {
    const role = await ctx.store.getRoleById(body.targetId)
    if (!role || role.serverId !== channel.serverId) {
      return error(ctx.corsOrigin, 404, "Role not found in this server.")
    }
  } else if (!(await ctx.store.isServerMember(channel.serverId, body.targetId))) {
    return error(ctx.corsOrigin, 404, "Member not found in this server.")
  }

  const overwrite = await ctx.store.upsertChannelOverwrite(
    channel.id,
    body.targetType,
    body.targetId,
    body.allowPermissions ?? [],
    body.denyPermissions ?? []
  )
  return json(ctx.corsOrigin, 200, overwrite)
}
