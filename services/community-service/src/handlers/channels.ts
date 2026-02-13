import type { Channel, CreateChannelRequest, UpdateChannelRequest } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"

export async function handleCreateChannel(
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

  if (!(await ctx.store.hasServerPermission(server.id, user.id, "manage_channels"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: manage_channels.")
  }

  const body = await readJson<CreateChannelRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const name = body.name?.trim()
  if (!name || name.length < 2) {
    return error(ctx.corsOrigin, 400, "Channel name must be at least 2 characters.")
  }

  const channel: Channel = await ctx.store.createChannel(serverId, name)

  return json(ctx.corsOrigin, 201, channel)
}

export async function handleListChannels(
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

  const channels = await ctx.store.listChannelsForUser(serverId, user.id)

  return json(ctx.corsOrigin, 200, channels)
}

export async function handleUpdateChannel(
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

  const body = await readJson<UpdateChannelRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const name = body.name?.trim()
  if (!name || name.length < 2) {
    return error(ctx.corsOrigin, 400, "Channel name must be at least 2 characters.")
  }

  const updated = await ctx.store.updateChannel(channelId, name)
  if (!updated) {
    return error(ctx.corsOrigin, 404, "Channel not found.")
  }

  return json(ctx.corsOrigin, 200, updated)
}

export async function handleDeleteChannel(
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

  const deleted = await ctx.store.deleteChannel(channelId)
  if (!deleted) {
    return error(ctx.corsOrigin, 404, "Channel not found.")
  }

  return json(ctx.corsOrigin, 200, { status: "ok" as const })
}
