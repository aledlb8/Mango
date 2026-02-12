import type { AuthResponse, LoginRequest, RegisterRequest } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { createId } from "../data/id"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"

export async function handleRegister(request: Request, ctx: RouteContext): Promise<Response> {
  const body = await readJson<RegisterRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const email = body.email?.trim().toLowerCase()
  const username = body.username?.trim()
  const displayName = body.displayName?.trim()
  const password = body.password ?? ""

  if (!email || !email.includes("@")) {
    return error(ctx.corsOrigin, 400, "A valid email is required.")
  }

  if (!username || username.length < 2) {
    return error(ctx.corsOrigin, 400, "Username must be at least 2 characters.")
  }

  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return error(ctx.corsOrigin, 400, "Username must be 3-32 chars: letters, numbers, underscore.")
  }

  if (!displayName || displayName.length < 2 || displayName.length > 64) {
    return error(ctx.corsOrigin, 400, "Display name must be 2-64 characters.")
  }

  if (password.length < 8) {
    return error(ctx.corsOrigin, 400, "Password must be at least 8 characters.")
  }

  const existing = await ctx.store.findUserByEmail(email)
  if (existing) {
    return error(ctx.corsOrigin, 409, "Email is already registered.")
  }

  const usernameTaken = await ctx.store.findUserByUsername(username)
  if (usernameTaken) {
    return error(ctx.corsOrigin, 409, "Username is already taken.")
  }

  const passwordHash = await Bun.password.hash(password)
  const user = await ctx.store.createUser(email, username, displayName, passwordHash)
  const token = createId("tok")
  await ctx.store.createSession(token, user.id)

  const response: AuthResponse = {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt
    }
  }

  return json(ctx.corsOrigin, 201, response)
}

export async function handleLogin(request: Request, ctx: RouteContext): Promise<Response> {
  const body = await readJson<LoginRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const identifier = body.identifier?.trim()
  const password = body.password ?? ""

  if (!identifier || !password) {
    return error(ctx.corsOrigin, 400, "Identifier and password are required.")
  }

  const user = identifier.includes("@")
    ? await ctx.store.findUserByEmail(identifier.toLowerCase())
    : await ctx.store.findUserByUsername(identifier)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Invalid credentials.")
  }

  const ok = await Bun.password.verify(password, user.passwordHash)
  if (!ok) {
    return error(ctx.corsOrigin, 401, "Invalid credentials.")
  }

  const token = createId("tok")
  await ctx.store.createSession(token, user.id)

  const response: AuthResponse = {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt
    }
  }

  return json(ctx.corsOrigin, 200, response)
}

export async function handleGetMe(request: Request, ctx: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }
  return json(ctx.corsOrigin, 200, user)
}
