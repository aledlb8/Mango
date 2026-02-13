import { createHealthResponse } from "@mango/contracts"
import { handleGetMe, handleLogin, handleRegister } from "./handlers/auth"
import {
  handleCreateFriendRequest,
  handleGetUserById,
  handleListFriendRequests,
  handleListFriends,
  handleRespondFriendRequest,
  handleSearchUsers
} from "./handlers/social"
import { corsHeaders, json } from "./http/response"
import type { IdentityRouteContext } from "./router-context"

const friendsRoute = /^\/v1\/friends$/
const friendRequestsRoute = /^\/v1\/friends\/requests$/
const friendRequestRoute = /^\/v1\/friends\/requests\/([^/]+)$/
const userRoute = /^\/v1\/users\/([^/]+)$/

export async function routeRequest(request: Request, ctx: IdentityRouteContext): Promise<Response> {
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

  if (pathname === "/v1/auth/register" && request.method === "POST") {
    return await handleRegister(request, ctx)
  }

  if (pathname === "/v1/auth/login" && request.method === "POST") {
    return await handleLogin(request, ctx)
  }

  if (pathname === "/v1/me" && request.method === "GET") {
    return await handleGetMe(request, ctx)
  }

  if (pathname === "/v1/users/search" && request.method === "GET") {
    return await handleSearchUsers(request, ctx)
  }

  const userMatch = pathname.match(userRoute)
  if (userMatch?.[1] && request.method === "GET") {
    return await handleGetUserById(request, userMatch[1], ctx)
  }

  if (friendsRoute.test(pathname) && request.method === "GET") {
    return await handleListFriends(request, ctx)
  }

  if (friendsRoute.test(pathname) && request.method === "POST") {
    return await handleCreateFriendRequest(request, ctx)
  }

  if (friendRequestsRoute.test(pathname) && request.method === "GET") {
    return await handleListFriendRequests(request, ctx)
  }

  if (friendRequestsRoute.test(pathname) && request.method === "POST") {
    return await handleCreateFriendRequest(request, ctx)
  }

  const friendRequestMatch = pathname.match(friendRequestRoute)
  if (friendRequestMatch?.[1] && request.method === "POST") {
    return await handleRespondFriendRequest(request, friendRequestMatch[1], ctx)
  }

  return json(ctx.corsOrigin, 200, {
    service: ctx.service,
    message: "Identity service is running.",
    routes: [
      "GET /health",
      "POST /v1/auth/register",
      "POST /v1/auth/login",
      "GET /v1/me",
      "GET /v1/users/search?q=term",
      "GET /v1/users/:userId",
      "GET /v1/friends",
      "POST /v1/friends",
      "GET /v1/friends/requests",
      "POST /v1/friends/requests",
      "POST /v1/friends/requests/:requestId"
    ]
  })
}
