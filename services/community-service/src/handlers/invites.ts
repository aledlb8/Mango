import type { CreateInviteRequest, ServerInvite } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"

function parseInviteOptions(input: CreateInviteRequest | null): { maxUses: number | null; expiresAt: string | null } {
  const maxUses =
    typeof input?.maxUses === "number" && Number.isFinite(input.maxUses) && input.maxUses > 0
      ? Math.trunc(input.maxUses)
      : null

  const expiresInHours =
    typeof input?.expiresInHours === "number" &&
    Number.isFinite(input.expiresInHours) &&
    input.expiresInHours > 0
      ? input.expiresInHours
      : null

  const expiresAt =
    expiresInHours === null ? null : new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()

  return { maxUses, expiresAt }
}

export async function handleCreateServerInvite(
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

  if (!(await ctx.store.hasServerPermission(server.id, user.id, "manage_server"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_server.")
  }

  const body = await readJson<CreateInviteRequest>(request)
  const options = parseInviteOptions(body)
  const invite: ServerInvite = await ctx.store.createServerInvite(
    server.id,
    user.id,
    options.maxUses,
    options.expiresAt
  )

  return json(ctx.corsOrigin, 201, invite)
}

export async function handleJoinServerInvite(
  request: Request,
  code: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const server = await ctx.store.joinServerByInvite(code.toUpperCase(), user.id)
  if (!server) {
    return error(ctx.corsOrigin, 404, "Invite not found or unavailable.")
  }

  return json(ctx.corsOrigin, 200, server)
}
