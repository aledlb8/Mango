import { requireAdminAccess } from "./admin-auth"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"

function parseDays(request: Request): number {
  const raw = new URL(request.url).searchParams.get("days")
  if (!raw) {
    return 30
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) {
    return 30
  }

  return Math.max(1, Math.min(parsed, 90))
}

export async function handleGetAdminAnalyticsOverview(
  request: Request,
  ctx: RouteContext
): Promise<Response> {
  const adminCheck = requireAdminAccess(request, ctx.corsOrigin)
  if (adminCheck) {
    return adminCheck
  }

  const days = parseDays(request)
  try {
    const overview = await ctx.store.getAdminAnalyticsOverview(days)
    return json(ctx.corsOrigin, 200, overview)
  } catch {
    return error(ctx.corsOrigin, 500, "Failed to build admin analytics overview.")
  }
}
