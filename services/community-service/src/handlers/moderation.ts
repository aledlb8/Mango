import type { CreateModerationActionRequest } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"

function parseAuditLimit(request: Request): number {
  const raw = new URL(request.url).searchParams.get("limit")
  if (!raw) {
    return 50
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) {
    return 50
  }

  return Math.max(1, Math.min(parsed, 200))
}

export async function handleCreateModerationAction(
  request: Request,
  serverId: string,
  ctx: RouteContext
): Promise<Response> {
  const actor = await getAuthenticatedUser(request, ctx.store)
  if (!actor) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const server = await ctx.store.getServerById(serverId)
  if (!server) {
    return error(ctx.corsOrigin, 404, "Server not found.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, actor.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const body = await readJson<CreateModerationActionRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  if (!body.targetUserId || !body.actionType) {
    return error(ctx.corsOrigin, 400, "targetUserId and actionType are required.")
  }

  if (!["kick", "ban", "timeout", "unban"].includes(body.actionType)) {
    return error(ctx.corsOrigin, 400, "Invalid moderation action type.")
  }

  const targetUser = await ctx.store.findUserById(body.targetUserId)
  if (!targetUser) {
    return error(ctx.corsOrigin, 404, "Target user not found.")
  }

  if (targetUser.id === server.ownerId && body.actionType !== "unban") {
    return error(ctx.corsOrigin, 400, "You cannot moderate the server owner.")
  }

  const reason = body.reason?.trim() || null
  let expiresAt: string | null = null

  if (body.actionType === "timeout") {
    const minutes = body.durationMinutes ?? 0
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 60 * 24 * 28) {
      return error(ctx.corsOrigin, 400, "durationMinutes must be between 1 and 40320.")
    }

    const isMember = await ctx.store.isServerMember(serverId, targetUser.id)
    if (!isMember) {
      return error(ctx.corsOrigin, 404, "Target user is not a member of this server.")
    }

    expiresAt = new Date(Date.now() + minutes * 60_000).toISOString()
  }

  if (body.actionType === "kick") {
    const isMember = await ctx.store.isServerMember(serverId, targetUser.id)
    if (!isMember) {
      return error(ctx.corsOrigin, 404, "Target user is not a member of this server.")
    }
  }

  if (body.actionType === "unban") {
    if (!(await ctx.store.isUserBanned(serverId, targetUser.id))) {
      return error(ctx.corsOrigin, 404, "Target user is not banned in this server.")
    }
  }

  if (body.actionType === "ban" && targetUser.id === actor.id) {
    return error(ctx.corsOrigin, 400, "You cannot ban yourself.")
  }

  const created = await ctx.store.createModerationAction(
    serverId,
    actor.id,
    targetUser.id,
    body.actionType,
    reason,
    expiresAt
  )

  return json(ctx.corsOrigin, 201, created)
}

export async function handleListAuditLogs(
  request: Request,
  serverId: string,
  ctx: RouteContext
): Promise<Response> {
  const actor = await getAuthenticatedUser(request, ctx.store)
  if (!actor) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const server = await ctx.store.getServerById(serverId)
  if (!server) {
    return error(ctx.corsOrigin, 404, "Server not found.")
  }

  if (!(await ctx.store.hasServerPermission(serverId, actor.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const limit = parseAuditLimit(request)
  const logs = await ctx.store.listAuditLogs(serverId, limit)
  return json(ctx.corsOrigin, 200, logs)
}
