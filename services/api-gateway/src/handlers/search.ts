import type { SearchScope } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"

function parseScope(raw: string | null): SearchScope {
  if (raw === "messages" || raw === "users" || raw === "channels") {
    return raw
  }
  return "all"
}

function parseLimit(raw: string | null): number {
  if (!raw) {
    return 25
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) {
    return 25
  }

  return Math.max(1, Math.min(parsed, 100))
}

export async function handleSearch(request: Request, ctx: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const url = new URL(request.url)
  const query = url.searchParams.get("q")?.trim() ?? ""
  if (query.length < 2) {
    return json(ctx.corsOrigin, 200, {
      users: [],
      channels: [],
      messages: []
    })
  }

  const scope = parseScope(url.searchParams.get("scope"))
  const serverId = url.searchParams.get("serverId")
  const limit = parseLimit(url.searchParams.get("limit"))

  const results = await ctx.store.search(query, user.id, scope, serverId, limit)
  return json(ctx.corsOrigin, 200, results)
}
