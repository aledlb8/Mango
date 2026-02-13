import type { CreatePushSubscriptionRequest } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"

export async function handleCreatePushSubscription(
  request: Request,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const body = await readJson<CreatePushSubscriptionRequest>(request)
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return error(ctx.corsOrigin, 400, "endpoint and keys (p256dh/auth) are required.")
  }

  const userAgent = request.headers.get("user-agent")
  const created = await ctx.store.createPushSubscription(
    user.id,
    body.endpoint,
    body.keys.p256dh,
    body.keys.auth,
    userAgent
  )

  return json(ctx.corsOrigin, 201, created)
}

export async function handleListPushSubscriptions(
  request: Request,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const subscriptions = await ctx.store.listPushSubscriptions(user.id)
  return json(ctx.corsOrigin, 200, subscriptions)
}

export async function handleDeletePushSubscription(
  request: Request,
  subscriptionId: string,
  ctx: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const deleted = await ctx.store.deletePushSubscription(user.id, subscriptionId)
  if (!deleted) {
    return error(ctx.corsOrigin, 404, "Push subscription not found.")
  }

  return json(ctx.corsOrigin, 200, { status: "ok" })
}
