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
