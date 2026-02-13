import type { DirectThread, User } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { error } from "../http/response"
import type { RouteContext } from "../router-context"

export type DirectThreadAccess = {
  user: User
  thread: DirectThread
}

export async function requireDirectThreadParticipant(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<DirectThreadAccess | Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const thread = await ctx.store.getDirectThreadById(threadId)
  if (!thread) {
    return error(ctx.corsOrigin, 404, "Direct thread not found.")
  }

  const isParticipant = await ctx.store.isDirectThreadParticipant(thread.id, user.id)
  if (!isParticipant) {
    return error(ctx.corsOrigin, 403, "Not a participant of this direct thread.")
  }

  return {
    user,
    thread
  }
}
