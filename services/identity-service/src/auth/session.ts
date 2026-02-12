import type { User } from "@mango/contracts"
import type { IdentityStore } from "../data/store"

export function readBearerTokenFromHeader(request: Request): string | null {
  const authHeader = request.headers.get("authorization")
  if (!authHeader) {
    return null
  }

  const [scheme, token] = authHeader.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null
  }

  return token
}

function readTokenFromCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie")
  if (!cookie) {
    return null
  }

  const pairs = cookie.split(";").map((item) => item.trim())
  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=")
    if (key !== "mango_token") {
      continue
    }

    const value = rest.join("=").trim()
    return value || null
  }

  return null
}

export async function getAuthenticatedUser(request: Request, store: IdentityStore): Promise<User | null> {
  const token = readBearerTokenFromHeader(request) ?? readTokenFromCookie(request)
  if (!token) {
    return null
  }

  const userId = await store.getUserIdByToken(token)
  if (!userId) {
    return null
  }

  const user = await store.findUserById(userId)
  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt
  }
}
