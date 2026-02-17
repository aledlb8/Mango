import { adminApiKey } from "../config"
import { error } from "../http/response"

export function hasAdminAccess(request: Request): boolean {
  if (!adminApiKey.trim()) {
    return false
  }

  const provided = request.headers.get("x-admin-key")?.trim() ?? ""
  return provided.length > 0 && provided === adminApiKey
}

export function requireAdminAccess(request: Request, corsOrigin: string): Response | null {
  if (hasAdminAccess(request)) {
    return null
  }

  return error(corsOrigin, 403, "Admin API key is required.")
}
