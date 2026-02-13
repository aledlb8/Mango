import type { CreateServerRequest, Server } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"

export async function handleCreateServer(request: Request, ctx: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const body = await readJson<CreateServerRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const name = body.name?.trim()
  if (!name || name.length < 2) {
    return error(ctx.corsOrigin, 400, "Server name must be at least 2 characters.")
  }

  const server: Server = await ctx.store.createServer(name, user.id)

  return json(ctx.corsOrigin, 201, server)
}

export async function handleListServers(request: Request, ctx: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const servers = await ctx.store.listServersForUser(user.id)

  return json(ctx.corsOrigin, 200, servers)
}

export async function handleLeaveServer(
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

  if (server.ownerId === user.id) {
    return error(ctx.corsOrigin, 400, "Server owner cannot leave. Delete the server instead.")
  }

  const left = await ctx.store.leaveServer(serverId, user.id)
  if (!left) {
    return error(ctx.corsOrigin, 404, "You're not a member of this server.")
  }

  return json(ctx.corsOrigin, 200, { status: "ok" as const })
}

export async function handleDeleteServer(
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

  if (server.ownerId !== user.id) {
    return error(ctx.corsOrigin, 403, "Only the server owner can delete this server.")
  }

  const deleted = await ctx.store.deleteServer(serverId)
  if (!deleted) {
    return error(ctx.corsOrigin, 404, "Server not found.")
  }

  return json(ctx.corsOrigin, 200, { status: "ok" as const })
}
