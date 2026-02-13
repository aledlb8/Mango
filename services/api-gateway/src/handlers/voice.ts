import type {
  JoinVoiceRequest,
  UpdateVoiceScreenShareRequest,
  UpdateVoiceStateRequest,
  VoiceHeartbeatRequest,
  VoiceSession
} from "@mango/contracts"
import type { User } from "@mango/contracts"
import { getAuthenticatedUser } from "../auth/session"
import { enableScreenShare, voiceSignalingServiceUrl } from "../config"
import { readJson } from "../http/request"
import { error, json } from "../http/response"
import type { RouteContext } from "../router-context"
import { requireDirectThreadParticipant } from "./direct-threads-common"

type VoiceTargetKind = "channel" | "direct_thread"

type VoiceAccess = {
  user: User
  targetKind: VoiceTargetKind
  targetId: string
  serverId: string | null
}

function encodeTarget(targetKind: VoiceTargetKind, targetId: string): string {
  if (targetKind === "channel") {
    return `/v1/voice/channels/${encodeURIComponent(targetId)}`
  }

  return `/v1/voice/direct-threads/${encodeURIComponent(targetId)}`
}

function isVoiceSession(value: unknown): value is VoiceSession {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<VoiceSession>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.targetId === "string" &&
    (candidate.targetKind === "channel" || candidate.targetKind === "direct_thread") &&
    Array.isArray(candidate.participants)
  )
}

async function proxyVoiceRequest(
  access: VoiceAccess,
  method: "GET" | "POST",
  suffix: string,
  body: unknown,
  ctx: RouteContext
): Promise<{ status: number; payload: unknown } | Response> {
  const path = `${encodeTarget(access.targetKind, access.targetId)}${suffix}`
  const url = `${voiceSignalingServiceUrl}${path}`
  const headers: Record<string, string> = {
    "X-Voice-User-Id": access.user.id,
    "X-Voice-Target-Kind": access.targetKind,
    "X-Voice-Target-Id": access.targetId,
    "X-Screen-Share-Enabled": String(enableScreenShare)
  }

  if (access.serverId) {
    headers["X-Voice-Server-Id"] = access.serverId
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
  }

  let upstream: Response
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch {
    return error(ctx.corsOrigin, 503, "Voice signaling service unavailable.")
  }

  let payload: unknown = null
  try {
    payload = await upstream.json()
  } catch {
    payload = null
  }

  if (!upstream.ok) {
    const message =
      payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
        ? ((payload as { error: string }).error)
        : "Voice signaling request failed."
    return error(ctx.corsOrigin, upstream.status, message)
  }

  return {
    status: upstream.status,
    payload
  }
}

async function publishVoiceSessionIfPresent(payload: unknown, ctx: RouteContext): Promise<void> {
  if (!isVoiceSession(payload)) {
    return
  }

  let serverMemberIds: string[] = []
  if (payload.serverId) {
    try {
      const members = await ctx.store.listServerMembers(payload.serverId)
      serverMemberIds = members.map((member) => member.id)
    } catch {
      // Fall back to participants-only broadcast
    }
  }

  ctx.realtimeHub.publishVoiceSessionUpdated(payload, serverMemberIds)
}

async function requireVoiceChannelAccess(
  request: Request,
  channelId: string,
  ctx: RouteContext
): Promise<VoiceAccess | Response> {
  const user = await getAuthenticatedUser(request, ctx.store)
  if (!user) {
    return error(ctx.corsOrigin, 401, "Unauthorized.")
  }

  const channel = await ctx.store.getChannelById(channelId)
  if (!channel) {
    return error(ctx.corsOrigin, 404, "Channel not found.")
  }

  if (channel.type !== "voice") {
    return error(ctx.corsOrigin, 400, "This endpoint is only available for voice channels.")
  }

  if (!(await ctx.store.hasChannelPermission(channel.id, user.id, "read_messages"))) {
    return error(ctx.corsOrigin, 403, "Missing permission: read_messages.")
  }

  return {
    user,
    targetKind: "channel",
    targetId: channel.id,
    serverId: channel.serverId
  }
}

async function requireDirectThreadVoiceAccess(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<VoiceAccess | Response> {
  const access = await requireDirectThreadParticipant(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  return {
    user: access.user,
    targetKind: "direct_thread",
    targetId: access.thread.id,
    serverId: null
  }
}

async function handleGetSessionForAccess(access: VoiceAccess, ctx: RouteContext): Promise<Response> {
  const proxied = await proxyVoiceRequest(access, "GET", "", undefined, ctx)
  if (proxied instanceof Response) {
    return proxied
  }

  return json(ctx.corsOrigin, proxied.status, proxied.payload)
}

async function handleJoinForAccess(
  request: Request,
  access: VoiceAccess,
  ctx: RouteContext
): Promise<Response> {
  const body = (await readJson<JoinVoiceRequest>(request)) ?? {}
  const proxied = await proxyVoiceRequest(access, "POST", "/join", body, ctx)
  if (proxied instanceof Response) {
    return proxied
  }

  await publishVoiceSessionIfPresent(proxied.payload, ctx)
  return json(ctx.corsOrigin, proxied.status, proxied.payload)
}

async function handleLeaveForAccess(access: VoiceAccess, ctx: RouteContext): Promise<Response> {
  const proxied = await proxyVoiceRequest(access, "POST", "/leave", {}, ctx)
  if (proxied instanceof Response) {
    return proxied
  }

  await publishVoiceSessionIfPresent(proxied.payload, ctx)
  return json(ctx.corsOrigin, proxied.status, proxied.payload)
}

async function handleStateForAccess(
  request: Request,
  access: VoiceAccess,
  ctx: RouteContext
): Promise<Response> {
  const body = await readJson<UpdateVoiceStateRequest>(request)
  if (!body) {
    return error(ctx.corsOrigin, 400, "Invalid JSON body.")
  }

  const proxied = await proxyVoiceRequest(access, "POST", "/state", body, ctx)
  if (proxied instanceof Response) {
    return proxied
  }

  await publishVoiceSessionIfPresent(proxied.payload, ctx)
  return json(ctx.corsOrigin, proxied.status, proxied.payload)
}

async function handleHeartbeatForAccess(
  request: Request,
  access: VoiceAccess,
  ctx: RouteContext
): Promise<Response> {
  const body = (await readJson<VoiceHeartbeatRequest>(request)) ?? {}
  const proxied = await proxyVoiceRequest(access, "POST", "/heartbeat", body, ctx)
  if (proxied instanceof Response) {
    return proxied
  }

  await publishVoiceSessionIfPresent(proxied.payload, ctx)
  return json(ctx.corsOrigin, proxied.status, proxied.payload)
}

async function handleScreenShareForAccess(
  request: Request,
  access: VoiceAccess,
  ctx: RouteContext
): Promise<Response> {
  if (!enableScreenShare) {
    return error(ctx.corsOrigin, 404, "Screen sharing is disabled.")
  }

  const body = await readJson<UpdateVoiceScreenShareRequest>(request)
  if (!body || typeof body.screenSharing !== "boolean") {
    return error(ctx.corsOrigin, 400, "screenSharing must be a boolean.")
  }

  const proxied = await proxyVoiceRequest(access, "POST", "/screen-share", body, ctx)
  if (proxied instanceof Response) {
    return proxied
  }

  await publishVoiceSessionIfPresent(proxied.payload, ctx)
  return json(ctx.corsOrigin, proxied.status, proxied.payload)
}

export async function handleGetVoiceChannelSession(
  request: Request,
  channelId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireVoiceChannelAccess(request, channelId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleGetSessionForAccess(access, ctx)
}

export async function handleJoinVoiceChannel(
  request: Request,
  channelId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireVoiceChannelAccess(request, channelId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleJoinForAccess(request, access, ctx)
}

export async function handleLeaveVoiceChannel(
  request: Request,
  channelId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireVoiceChannelAccess(request, channelId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleLeaveForAccess(access, ctx)
}

export async function handleUpdateVoiceChannelState(
  request: Request,
  channelId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireVoiceChannelAccess(request, channelId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleStateForAccess(request, access, ctx)
}

export async function handleVoiceChannelHeartbeat(
  request: Request,
  channelId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireVoiceChannelAccess(request, channelId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleHeartbeatForAccess(request, access, ctx)
}

export async function handleVoiceChannelScreenShare(
  request: Request,
  channelId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireVoiceChannelAccess(request, channelId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleScreenShareForAccess(request, access, ctx)
}

export async function handleGetDirectThreadCallSession(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadVoiceAccess(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleGetSessionForAccess(access, ctx)
}

export async function handleJoinDirectThreadCall(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadVoiceAccess(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleJoinForAccess(request, access, ctx)
}

export async function handleLeaveDirectThreadCall(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadVoiceAccess(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleLeaveForAccess(access, ctx)
}

export async function handleUpdateDirectThreadCallState(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadVoiceAccess(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleStateForAccess(request, access, ctx)
}

export async function handleDirectThreadCallHeartbeat(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadVoiceAccess(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleHeartbeatForAccess(request, access, ctx)
}

export async function handleDirectThreadCallScreenShare(
  request: Request,
  threadId: string,
  ctx: RouteContext
): Promise<Response> {
  const access = await requireDirectThreadVoiceAccess(request, threadId, ctx)
  if (access instanceof Response) {
    return access
  }

  return await handleScreenShareForAccess(request, access, ctx)
}
