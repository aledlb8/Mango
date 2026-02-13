import type {
  AddFriendRequest,
  FriendRequest,
  RespondFriendRequestRequest
} from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { IdentityRouteContext } from "../router-context"

export async function handleSearchUsers(request: Request, ctx: IdentityRouteContext): Promise<Response> {
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

function isAlreadyFriendsError(reason: unknown): boolean {
  if (!(reason instanceof Error)) {
    return false
  }

  return reason.message.toLowerCase().includes("already friends")
}

export async function handleCreateFriendRequest(
  request: Request,
  ctx: IdentityRouteContext
): Promise<Response> {
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

  try {
    const created: FriendRequest = await ctx.store.createFriendRequest(user.id, target.id)
    return json(ctx.corsOrigin, 201, created)
  } catch (reason) {
    if (isAlreadyFriendsError(reason)) {
      return error(ctx.corsOrigin, 409, "Users are already friends.")
    }

    throw reason
  }
}

export async function handleListFriendRequests(
  request: Request,
  ctx: IdentityRouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const requests = await ctx.store.listFriendRequests(user.id)
  return json(ctx.corsOrigin, 200, requests)
}

export async function handleRespondFriendRequest(
  request: Request,
  requestId: string,
  ctx: IdentityRouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const body = await readJson<RespondFriendRequestRequest>(request)
  if (!body || (body.action !== "accept" && body.action !== "reject")) {
    return error(ctx.corsOrigin, 400, "action must be either 'accept' or 'reject'.")
  }

  const pending = await ctx.store.listFriendRequests(user.id)
  const targetRequest = pending.find((item) => item.id === requestId)
  if (!targetRequest) {
    return error(ctx.corsOrigin, 404, "Friend request not found.")
  }

  if (targetRequest.toUserId !== user.id) {
    return error(ctx.corsOrigin, 403, "Only the target user can respond to this request.")
  }

  const responded = await ctx.store.respondFriendRequest(requestId, user.id, body.action)
  if (!responded) {
    return error(ctx.corsOrigin, 409, "Friend request is no longer pending.")
  }

  return json(ctx.corsOrigin, 200, responded)
}

export async function handleListFriends(request: Request, ctx: IdentityRouteContext): Promise<Response> {
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
  ctx: IdentityRouteContext
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
