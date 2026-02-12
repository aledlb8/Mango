import type { AddFriendRequest } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"

export async function handleSearchUsers(request: Request, ctx: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (query.length < 2) {
    return json(ctx.corsOrigin, 200, [])
  }

  const users = await ctx.store.searchUsers(query, user.id)
  return json(ctx.corsOrigin, 200, users)
}

export async function handleAddFriend(request: Request, ctx: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const body = await readJson<AddFriendRequest>(request)
  if (!body || !body.userId) {
    return error(ctx.corsOrigin, 400, "userId is required.")
  }

  if (body.userId === user.id) {
    return error(ctx.corsOrigin, 400, "You cannot add yourself.")
  }

  const target = await ctx.store.findUserById(body.userId)
  if (!target) {
    return error(ctx.corsOrigin, 404, "User not found.")
  }

  await ctx.store.addFriend(user.id, target.id)
  return json(ctx.corsOrigin, 200, { status: "ok" })
}

export async function handleListFriends(request: Request, ctx: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const friends = await ctx.store.listFriends(user.id)
  return json(ctx.corsOrigin, 200, friends)
}

export async function handleGetUserById(
  request: Request,
  userId: string,
  ctx: RouteContext
): Promise<Response> {
  const viewer = await getAuthenticatedUser(request, ctx.store)
  if (!viewer) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const user = await ctx.store.findUserById(userId)
  if (!user) {
    return error(ctx.corsOrigin, 404, "User not found.")
  }

  return json(ctx.corsOrigin, 200, {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt
  })
}
