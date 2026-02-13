import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test"
import type {
  AuditLogEntry,
  AddReactionRequest,
  Attachment,
  AuthResponse,
  Channel,
  ChannelPermissionOverwrite,
  CreateMessageRequest,
  CreateModerationActionRequest,
  CreateRoleRequest,
  CreateServerRequest,
  DirectThread,
  FriendRequest,
  Message,
  ModerationAction,
  PresenceState,
  PushSubscription,
  ReadMarker,
  Role,
  SearchResults,
  Server,
  ServerInvite,
  TypingIndicator,
  User,
  VoiceSession
} from "@mango/contracts"
import { MemoryStore } from "./data/memory-store"
import { RealtimeHub } from "./realtime/hub"
import { routeRequest as routeCommunityRequest } from "../../community-service/src/router"
import { routeRequest as routeIdentityRequest } from "../../identity-service/src/router"
import { routeRequest as routeMessagingRequest } from "../../messaging-service/src/router"

setDefaultTimeout(15_000)

type GatewayRouteFn = (request: Request, ctx: unknown) => Promise<Response>

type ServiceHits = {
  identity: number
  community: number
  messaging: number
  media: number
  presence: number
  voice: number
}

type SocketEvent = {
  type?: string
  payload?: unknown
  channelId?: string
}

type FakeSocket = {
  data: {
    userId: string
    subscriptions: Set<string>
  }
  send: (payload: string) => void
}

const store = new MemoryStore()
const realtimeHub = new RealtimeHub()
const serviceHits: ServiceHits = {
  identity: 0,
  community: 0,
  messaging: 0,
  media: 0,
  presence: 0,
  voice: 0
}

let identityServer: ReturnType<typeof Bun.serve> | null = null
let communityServer: ReturnType<typeof Bun.serve> | null = null
let messagingServer: ReturnType<typeof Bun.serve> | null = null
let mediaServer: ReturnType<typeof Bun.serve> | null = null
let presenceServer: ReturnType<typeof Bun.serve> | null = null
let voiceServer: ReturnType<typeof Bun.serve> | null = null
let routeGatewayRequest: GatewayRouteFn
const mediaAttachmentsById = new Map<string, Attachment>()

const originalEnv = {
  IDENTITY_SERVICE_URL: process.env.IDENTITY_SERVICE_URL,
  COMMUNITY_SERVICE_URL: process.env.COMMUNITY_SERVICE_URL,
  MESSAGING_SERVICE_URL: process.env.MESSAGING_SERVICE_URL,
  MEDIA_SERVICE_URL: process.env.MEDIA_SERVICE_URL,
  PRESENCE_SERVICE_URL: process.env.PRESENCE_SERVICE_URL,
  VOICE_SIGNALING_SERVICE_URL: process.env.VOICE_SIGNALING_SERVICE_URL,
  PREFER_IDENTITY_SERVICE_PROXY: process.env.PREFER_IDENTITY_SERVICE_PROXY,
  PREFER_COMMUNITY_SERVICE_PROXY: process.env.PREFER_COMMUNITY_SERVICE_PROXY,
  PREFER_MESSAGING_SERVICE_PROXY: process.env.PREFER_MESSAGING_SERVICE_PROXY,
  PREFER_MEDIA_SERVICE_PROXY: process.env.PREFER_MEDIA_SERVICE_PROXY,
  PREFER_PRESENCE_SERVICE_PROXY: process.env.PREFER_PRESENCE_SERVICE_PROXY,
  PREFER_VOICE_SIGNALING_PROXY: process.env.PREFER_VOICE_SIGNALING_PROXY,
  ENABLE_SCREEN_SHARE: process.env.ENABLE_SCREEN_SHARE,
  DISABLE_RATE_LIMITING: process.env.DISABLE_RATE_LIMITING
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }
}

function createGatewayContext(): unknown {
  return {
    service: "api-gateway",
    corsOrigin: "*",
    store,
    realtimeHub
  }
}

function createUniqueSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10)
}

function createUniqueIdentity(prefix: string): { email: string; username: string; displayName: string } {
  const suffix = createUniqueSuffix()
  return {
    email: `${prefix}-${suffix}@example.com`,
    username: `${prefix}_${suffix}`.slice(0, 32),
    displayName: `${prefix} ${suffix.slice(0, 6)}`
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function callGateway<T>(params: {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  token?: string
  body?: unknown
}): Promise<{ status: number; body: T }> {
  const headers = new Headers()
  if (params.token) {
    headers.set("Authorization", `Bearer ${params.token}`)
  }
  if (params.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  const request = new Request(`http://localhost:3001${params.path}`, {
    method: params.method,
    headers,
    body: params.body === undefined ? undefined : JSON.stringify(params.body)
  })

  const response = await routeGatewayRequest(request, createGatewayContext())
  const body = await parseJson<T>(response)
  return {
    status: response.status,
    body
  }
}

async function registerUser(prefix: string): Promise<AuthResponse> {
  const identity = createUniqueIdentity(prefix)
  const register = await callGateway<AuthResponse>({
    method: "POST",
    path: "/v1/auth/register",
    body: {
      email: identity.email,
      username: identity.username,
      displayName: identity.displayName,
      password: "password123"
    }
  })

  expect(register.status).toBe(201)
  return register.body
}

async function bootstrapServerAndChannel(token: string, namePrefix: string): Promise<{ server: Server; channel: Channel }> {
  const createdServer = await callGateway<Server>({
    method: "POST",
    path: "/v1/servers",
    token,
    body: { name: `${namePrefix}-${createUniqueSuffix()}` } satisfies CreateServerRequest
  })
  expect(createdServer.status).toBe(201)

  const createdChannel = await callGateway<Channel>({
    method: "POST",
    path: `/v1/servers/${createdServer.body.id}/channels`,
    token,
    body: { name: `general-${createUniqueSuffix().slice(0, 6)}` }
  })
  expect(createdChannel.status).toBe(201)

  return {
    server: createdServer.body,
    channel: createdChannel.body
  }
}

function attachRealtimeCollector(userId: string, conversationId?: string): SocketEvent[] {
  const events: SocketEvent[] = []

  const fakeSocket: FakeSocket = {
    data: {
      userId,
      subscriptions: new Set<string>()
    },
    send(payload: string) {
      events.push(JSON.parse(payload) as SocketEvent)
    }
  }

  realtimeHub.registerSocket(fakeSocket as never)
  if (conversationId) {
    realtimeHub.addSubscription(fakeSocket as never, conversationId)
  }
  return events
}

function eventsOfType(events: SocketEvent[], type: string): SocketEvent[] {
  return events.filter((event) => event.type === type)
}

describe("api-gateway proxy integration", () => {
  beforeAll(async () => {
    identityServer = Bun.serve({
      port: 0,
      fetch(request) {
        serviceHits.identity += 1
        return routeIdentityRequest(
          request,
          { service: "identity-service", corsOrigin: "*", store } as never
        )
      }
    })

    communityServer = Bun.serve({
      port: 0,
      fetch(request) {
        serviceHits.community += 1
        return routeCommunityRequest(
          request,
          { service: "community-service", corsOrigin: "*", store } as never
        )
      }
    })

    messagingServer = Bun.serve({
      port: 0,
      fetch(request) {
        serviceHits.messaging += 1
        return routeMessagingRequest(
          request,
          { service: "messaging-service", corsOrigin: "*", store } as never
        )
      }
    })

    mediaServer = Bun.serve({
      port: 0,
      async fetch(request) {
        serviceHits.media += 1

        const { pathname } = new URL(request.url)
        if (pathname === "/health") {
          return Response.json({
            service: "media-service",
            status: "ok",
            timestamp: new Date().toISOString()
          })
        }

        if (pathname === "/v1/attachments" && request.method === "POST") {
          const payload = (await request.json().catch(() => null)) as
            | { fileName?: string; contentType?: string; sizeBytes?: number }
            | null

          if (!payload?.fileName || !payload.contentType || !payload.sizeBytes) {
            return Response.json({ error: "Invalid attachment payload." }, { status: 400 })
          }

          const id = `att_${createUniqueSuffix()}`
          const attachment: Attachment = {
            id,
            fileName: payload.fileName,
            contentType: payload.contentType,
            sizeBytes: payload.sizeBytes,
            url: `/uploads/${id}/${encodeURIComponent(payload.fileName)}`,
            uploadedBy: "unknown",
            createdAt: new Date().toISOString()
          }

          mediaAttachmentsById.set(id, attachment)
          return Response.json(attachment, { status: 201 })
        }

        return Response.json({ error: "Route not found." }, { status: 404 })
      }
    })

    presenceServer = Bun.serve({
      port: 0,
      async fetch(request) {
        serviceHits.presence += 1

        const { pathname } = new URL(request.url)
        if (pathname === "/health") {
          return Response.json({
            service: "presence-service",
            status: "ok",
            timestamp: new Date().toISOString()
          })
        }

        const authorization = request.headers.get("authorization") ?? ""
        const bearer = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : ""
        if (!bearer) {
          return Response.json({ error: "Unauthorized." }, { status: 401 })
        }

        const userId = await store.getUserIdByToken(bearer)
        if (!userId) {
          return Response.json({ error: "Unauthorized." }, { status: 401 })
        }

        if (pathname === "/v1/presence" && request.method === "PUT") {
          const payload = (await request.json().catch(() => null)) as { status?: string } | null
          const statusRaw = payload?.status ?? "online"
          if (!["online", "idle", "dnd"].includes(statusRaw)) {
            return Response.json({ error: "Invalid status." }, { status: 400 })
          }
          const status = statusRaw as PresenceState["status"]

          return Response.json({
            userId,
            status,
            lastSeenAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30_000).toISOString()
          } satisfies PresenceState)
        }

        if (pathname === "/v1/presence/me" && request.method === "GET") {
          return Response.json({
            userId,
            status: "online",
            lastSeenAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30_000).toISOString()
          } satisfies PresenceState)
        }

        if (pathname === "/v1/presence/bulk" && request.method === "POST") {
          const payload = (await request.json().catch(() => null)) as { userIds?: string[] } | null
          const userIds = Array.isArray(payload?.userIds) ? payload.userIds : []
          return Response.json(
            userIds.map((targetUserId) => ({
              userId: targetUserId,
              status: targetUserId === userId ? "online" : "offline",
              lastSeenAt: new Date().toISOString(),
              expiresAt: targetUserId === userId ? new Date(Date.now() + 30_000).toISOString() : null
            } satisfies PresenceState))
          )
        }

        if (pathname.startsWith("/v1/presence/") && request.method === "GET") {
          const targetUserId = decodeURIComponent(pathname.replace("/v1/presence/", "").trim())
          if (!targetUserId) {
            return Response.json({ error: "userId is required." }, { status: 400 })
          }

          return Response.json({
            userId: targetUserId,
            status: targetUserId === userId ? "online" : "offline",
            lastSeenAt: new Date().toISOString(),
            expiresAt: targetUserId === userId ? new Date(Date.now() + 30_000).toISOString() : null
          } satisfies PresenceState)
        }

        return Response.json({ error: "Route not found." }, { status: 404 })
      }
    })

    const voiceSessionsByTarget = new Map<string, VoiceSession>()

    voiceServer = Bun.serve({
      port: 0,
      async fetch(request) {
        serviceHits.voice += 1

        const { pathname } = new URL(request.url)
        if (pathname === "/health") {
          return Response.json({
            service: "voice-signaling",
            status: "ok",
            timestamp: new Date().toISOString()
          })
        }

        const match = pathname.match(
          /^\/v1\/voice\/(channels|direct-threads)\/([^/]+)(?:\/(join|leave|state|heartbeat|screen-share))?$/
        )
        if (!match) {
          return Response.json({ error: "Route not found." }, { status: 404 })
        }

        const targetKind: VoiceSession["targetKind"] = match[1] === "channels" ? "channel" : "direct_thread"
        const targetId = decodeURIComponent(match[2] ?? "")
        const action = match[3] ?? ""
        const userId = request.headers.get("x-voice-user-id") ?? ""
        const serverId = request.headers.get("x-voice-server-id")
        if (!userId.trim()) {
          return Response.json({ error: "Missing X-Voice-User-Id." }, { status: 401 })
        }

        const key = `${targetKind}:${targetId}`
        const now = new Date().toISOString()
        const existing = voiceSessionsByTarget.get(key)
        const session: VoiceSession =
          existing ??
          ({
            id: `vsn_${createUniqueSuffix()}`,
            targetKind,
            targetId,
            serverId: serverId || null,
            startedAt: now,
            updatedAt: now,
            reconnectGraceMs: 30_000,
            features: {
              screenShare: true
            },
            participants: [],
            signaling: {
              url: "ws://localhost:7880",
              roomName: `test_${targetKind}_${targetId}`,
              participantToken: `tok_${userId}_${createUniqueSuffix().slice(0, 6)}`
            }
          } satisfies VoiceSession)

        session.updatedAt = now
        session.serverId = serverId || session.serverId || null
        session.signaling = {
          ...session.signaling,
          participantToken: `tok_${userId}_${createUniqueSuffix().slice(0, 6)}`
        }

        const currentParticipantIndex = session.participants.findIndex((participant) => participant.userId === userId)
        const currentParticipant =
          currentParticipantIndex >= 0
            ? session.participants[currentParticipantIndex]
            : {
                userId,
                muted: false,
                deafened: false,
                speaking: false,
                screenSharing: false,
                joinedAt: now,
                lastSeenAt: now
              }

        if (action === "" && request.method === "GET") {
          return Response.json(existing ?? null)
        }

        if (request.method !== "POST") {
          return Response.json({ error: "Method not allowed." }, { status: 405 })
        }

        const payload = (await request.json().catch(() => null)) as
          | {
              muted?: boolean
              deafened?: boolean
              speaking?: boolean
              screenSharing?: boolean
            }
          | null

        if (action === "join") {
          currentParticipant.muted = payload?.muted ?? currentParticipant.muted
          currentParticipant.deafened = payload?.deafened ?? currentParticipant.deafened
          currentParticipant.speaking = payload?.speaking ?? currentParticipant.speaking
          currentParticipant.lastSeenAt = now
          if (currentParticipant.deafened) {
            currentParticipant.speaking = false
          }
          if (currentParticipantIndex >= 0) {
            session.participants[currentParticipantIndex] = currentParticipant
          } else {
            session.participants.push(currentParticipant)
          }
          voiceSessionsByTarget.set(key, session)
          return Response.json(session)
        }

        if (action === "leave") {
          session.participants = session.participants.filter((participant) => participant.userId !== userId)
          voiceSessionsByTarget.set(key, session)
          return Response.json(session)
        }

        if (action === "state" || action === "heartbeat") {
          if (currentParticipantIndex < 0) {
            return Response.json({ error: "not connected to this voice session" }, { status: 404 })
          }

          if (typeof payload?.muted === "boolean") {
            currentParticipant.muted = payload.muted
          }
          if (typeof payload?.deafened === "boolean") {
            currentParticipant.deafened = payload.deafened
          }
          if (typeof payload?.speaking === "boolean") {
            currentParticipant.speaking = payload.speaking
          }
          if (currentParticipant.deafened) {
            currentParticipant.speaking = false
          }
          currentParticipant.lastSeenAt = now
          session.participants[currentParticipantIndex] = currentParticipant
          voiceSessionsByTarget.set(key, session)
          return Response.json(session)
        }

        if (action === "screen-share") {
          if (currentParticipantIndex < 0) {
            return Response.json({ error: "not connected to this voice session" }, { status: 404 })
          }
          currentParticipant.screenSharing = Boolean(payload?.screenSharing)
          currentParticipant.lastSeenAt = now
          session.participants[currentParticipantIndex] = currentParticipant
          voiceSessionsByTarget.set(key, session)
          return Response.json(session)
        }

        return Response.json({ error: "Route not found." }, { status: 404 })
      }
    })

    process.env.IDENTITY_SERVICE_URL = `http://127.0.0.1:${identityServer.port}`
    process.env.COMMUNITY_SERVICE_URL = `http://127.0.0.1:${communityServer.port}`
    process.env.MESSAGING_SERVICE_URL = `http://127.0.0.1:${messagingServer.port}`
    process.env.MEDIA_SERVICE_URL = `http://127.0.0.1:${mediaServer.port}`
    process.env.PRESENCE_SERVICE_URL = `http://127.0.0.1:${presenceServer.port}`
    process.env.VOICE_SIGNALING_SERVICE_URL = `http://127.0.0.1:${voiceServer.port}`
    process.env.PREFER_IDENTITY_SERVICE_PROXY = "true"
    process.env.PREFER_COMMUNITY_SERVICE_PROXY = "true"
    process.env.PREFER_MESSAGING_SERVICE_PROXY = "true"
    process.env.PREFER_MEDIA_SERVICE_PROXY = "true"
    process.env.PREFER_PRESENCE_SERVICE_PROXY = "true"
    process.env.PREFER_VOICE_SIGNALING_PROXY = "true"
    process.env.ENABLE_SCREEN_SHARE = "true"
    process.env.DISABLE_RATE_LIMITING = "true"

    const gatewayModule = await import("./router")
    routeGatewayRequest = gatewayModule.routeRequest as GatewayRouteFn
  })

  afterAll(() => {
    voiceServer?.stop(true)
    presenceServer?.stop(true)
    mediaServer?.stop(true)
    messagingServer?.stop(true)
    communityServer?.stop(true)
    identityServer?.stop(true)
    restoreEnv()
  })

  it("emits realtime events for proxied message create/update/reaction/delete flows", async () => {
    const hitsBefore = { ...serviceHits }

    const auth = await registerUser("events")
    const bootstrap = await bootstrapServerAndChannel(auth.token, "events-server")

    const socketEvents = attachRealtimeCollector(auth.user.id, bootstrap.channel.id)

    const createdMessage = await callGateway<Message>({
      method: "POST",
      path: `/v1/channels/${bootstrap.channel.id}/messages`,
      token: auth.token,
      body: { body: "message one" } satisfies CreateMessageRequest
    })
    expect(createdMessage.status).toBe(201)

    const updatedMessage = await callGateway<Message>({
      method: "PATCH",
      path: `/v1/messages/${createdMessage.body.id}`,
      token: auth.token,
      body: { body: "message one edited" }
    })
    expect(updatedMessage.status).toBe(200)
    expect(updatedMessage.body.body).toBe("message one edited")

    const reacted = await callGateway<{ messageId: string; reactions: { emoji: string; count: number }[] }>({
      method: "POST",
      path: `/v1/messages/${createdMessage.body.id}/reactions`,
      token: auth.token,
      body: { emoji: "🔥" } satisfies AddReactionRequest
    })
    expect(reacted.status).toBe(200)
    expect(reacted.body.messageId).toBe(createdMessage.body.id)
    expect(reacted.body.reactions.find((entry) => entry.emoji === "🔥")?.count).toBe(1)

    const unreacted = await callGateway<{ messageId: string; reactions: { emoji: string; count: number }[] }>({
      method: "DELETE",
      path: `/v1/messages/${createdMessage.body.id}/reactions/${encodeURIComponent("🔥")}`,
      token: auth.token
    })
    expect(unreacted.status).toBe(200)
    expect(unreacted.body.reactions.find((entry) => entry.emoji === "🔥")).toBeUndefined()

    const deleted = await callGateway<{ id: string; channelId: string }>({
      method: "DELETE",
      path: `/v1/messages/${createdMessage.body.id}`,
      token: auth.token
    })
    expect(deleted.status).toBe(200)
    expect(deleted.body.id).toBe(createdMessage.body.id)

    const createdEvents = eventsOfType(socketEvents, "message.created")
    const updatedEvents = eventsOfType(socketEvents, "message.updated")
    const reactionEvents = eventsOfType(socketEvents, "reaction.updated")
    const deletedEvents = eventsOfType(socketEvents, "message.deleted")

    expect(createdEvents.length).toBe(1)
    expect(updatedEvents.length).toBe(1)
    expect(reactionEvents.length).toBe(2)
    expect(deletedEvents.length).toBe(1)

    const createdPayload = createdEvents[0]?.payload as Message
    const updatedPayload = updatedEvents[0]?.payload as Message
    const deletedPayload = deletedEvents[0]?.payload as { id: string; channelId: string }

    expect(createdPayload.id).toBe(createdMessage.body.id)
    expect(updatedPayload.body).toBe("message one edited")
    expect(deletedPayload.id).toBe(createdMessage.body.id)

    expect(serviceHits.identity).toBeGreaterThan(hitsBefore.identity)
    expect(serviceHits.community).toBeGreaterThan(hitsBefore.community)
    expect(serviceHits.messaging).toBeGreaterThan(hitsBefore.messaging)
  })

  it("routes invites, member management, roles, and overwrites through community-service", async () => {
    const hitsBeforeCommunity = serviceHits.community

    const owner = await registerUser("owner")
    const member = await registerUser("member")

    const bootstrap = await bootstrapServerAndChannel(owner.token, "community-flow")

    const invite = await callGateway<ServerInvite>({
      method: "POST",
      path: `/v1/servers/${bootstrap.server.id}/invites`,
      token: owner.token,
      body: {}
    })
    expect(invite.status).toBe(201)
    expect(invite.body.serverId).toBe(bootstrap.server.id)

    const joined = await callGateway<Server>({
      method: "POST",
      path: `/v1/invites/${invite.body.code}/join`,
      token: member.token
    })
    expect(joined.status).toBe(200)
    expect(joined.body.id).toBe(bootstrap.server.id)

    const listedMembers = await callGateway<User[]>({
      method: "GET",
      path: `/v1/servers/${bootstrap.server.id}/members`,
      token: owner.token
    })
    expect(listedMembers.status).toBe(200)
    expect(listedMembers.body.some((user) => user.id === member.user.id)).toBe(true)

    const createdRole = await callGateway<Role>({
      method: "POST",
      path: `/v1/servers/${bootstrap.server.id}/roles`,
      token: owner.token,
      body: {
        name: `Mod-${createUniqueSuffix().slice(0, 5)}`,
        permissions: ["read_messages", "send_messages"]
      } satisfies CreateRoleRequest
    })
    expect(createdRole.status).toBe(201)
    expect(createdRole.body.serverId).toBe(bootstrap.server.id)

    const assignRole = await callGateway<{ status: string }>({
      method: "POST",
      path: `/v1/servers/${bootstrap.server.id}/roles/assign`,
      token: owner.token,
      body: {
        roleId: createdRole.body.id,
        memberId: member.user.id
      }
    })
    expect(assignRole.status).toBe(200)
    expect(assignRole.body.status).toBe("ok")

    const overwrite = await callGateway<ChannelPermissionOverwrite>({
      method: "PUT",
      path: `/v1/channels/${bootstrap.channel.id}/overwrites`,
      token: owner.token,
      body: {
        targetType: "role",
        targetId: createdRole.body.id,
        allowPermissions: ["read_messages"],
        denyPermissions: ["send_messages"]
      }
    })
    expect(overwrite.status).toBe(200)
    expect(overwrite.body.channelId).toBe(bootstrap.channel.id)
    expect(overwrite.body.targetType).toBe("role")
    expect(overwrite.body.targetId).toBe(createdRole.body.id)

    const listedRoles = await callGateway<Role[]>({
      method: "GET",
      path: `/v1/servers/${bootstrap.server.id}/roles`,
      token: owner.token
    })
    expect(listedRoles.status).toBe(200)
    expect(listedRoles.body.some((role) => role.id === createdRole.body.id)).toBe(true)

    expect(serviceHits.community).toBeGreaterThan(hitsBeforeCommunity)
  })

  it("uses friend requests instead of immediate add and supports accept flow", async () => {
    const hitsBeforeIdentity = serviceHits.identity

    const alice = await registerUser("friendalice")
    const bob = await registerUser("friendbob")

    const createdRequest = await callGateway<FriendRequest>({
      method: "POST",
      path: "/v1/friends/requests",
      token: alice.token,
      body: {
        userId: bob.user.id
      }
    })

    expect(createdRequest.status).toBe(201)
    expect(createdRequest.body.fromUserId).toBe(alice.user.id)
    expect(createdRequest.body.toUserId).toBe(bob.user.id)
    expect(createdRequest.body.status).toBe("pending")

    const bobPending = await callGateway<FriendRequest[]>({
      method: "GET",
      path: "/v1/friends/requests",
      token: bob.token
    })

    expect(bobPending.status).toBe(200)
    expect(bobPending.body.some((request) => request.id === createdRequest.body.id)).toBe(true)

    const accepted = await callGateway<FriendRequest>({
      method: "POST",
      path: `/v1/friends/requests/${createdRequest.body.id}`,
      token: bob.token,
      body: {
        action: "accept"
      }
    })

    expect(accepted.status).toBe(200)
    expect(accepted.body.status).toBe("accepted")

    const aliceFriends = await callGateway<User[]>({
      method: "GET",
      path: "/v1/friends",
      token: alice.token
    })
    expect(aliceFriends.status).toBe(200)
    expect(aliceFriends.body.some((user) => user.id === bob.user.id)).toBe(true)

    const bobFriends = await callGateway<User[]>({
      method: "GET",
      path: "/v1/friends",
      token: bob.token
    })
    expect(bobFriends.status).toBe(200)
    expect(bobFriends.body.some((user) => user.id === alice.user.id)).toBe(true)

    expect(serviceHits.identity).toBeGreaterThan(hitsBeforeIdentity)
  })

  it("pushes direct-thread creation and messages to participants without refresh", async () => {
    const alice = await registerUser("realtimealice")
    const bob = await registerUser("realtimebob")

    const bobEvents = attachRealtimeCollector(bob.user.id)

    const thread = await callGateway<DirectThread>({
      method: "POST",
      path: "/v1/direct-threads",
      token: alice.token,
      body: {
        participantIds: [bob.user.id]
      }
    })

    expect(thread.status).toBe(201)

    const createdThreadEvents = eventsOfType(bobEvents, "direct-thread.created")
    expect(createdThreadEvents.length).toBe(1)
    expect((createdThreadEvents[0]?.payload as DirectThread).id).toBe(thread.body.id)

    const message = await callGateway<Message>({
      method: "POST",
      path: `/v1/direct-threads/${thread.body.id}/messages`,
      token: alice.token,
      body: {
        body: "hello bob"
      } satisfies CreateMessageRequest
    })

    expect(message.status).toBe(201)

    const messageEvents = eventsOfType(bobEvents, "message.created")
    expect(messageEvents.some((event) => (event.payload as Message).id === message.body.id)).toBe(true)
  })

  it("supports direct threads, attachments, read markers, and typing indicators", async () => {
    const hitsBefore = { ...serviceHits }

    const alice = await registerUser("directalice")
    const bob = await registerUser("directbob")

    const thread = await callGateway<DirectThread>({
      method: "POST",
      path: "/v1/direct-threads",
      token: alice.token,
      body: {
        participantIds: [bob.user.id]
      }
    })

    expect(thread.status).toBe(201)
    expect(thread.body.kind).toBe("dm")
    expect(thread.body.participantIds.includes(alice.user.id)).toBe(true)
    expect(thread.body.participantIds.includes(bob.user.id)).toBe(true)

    const uploadedAttachment = await callGateway<Attachment>({
      method: "POST",
      path: "/v1/attachments",
      token: alice.token,
      body: {
        fileName: "demo.txt",
        contentType: "text/plain",
        sizeBytes: 128
      }
    })

    expect(uploadedAttachment.status).toBe(201)
    expect(uploadedAttachment.body.fileName).toBe("demo.txt")

    const socketEvents = attachRealtimeCollector(alice.user.id, thread.body.id)

    const createdMessage = await callGateway<Message>({
      method: "POST",
      path: `/v1/direct-threads/${thread.body.id}/messages`,
      token: alice.token,
      body: {
        body: "hello from direct thread",
        attachments: [uploadedAttachment.body]
      } satisfies CreateMessageRequest
    })

    expect(createdMessage.status).toBe(201)
    expect(createdMessage.body.conversationId).toBe(thread.body.id)
    expect(createdMessage.body.directThreadId).toBe(thread.body.id)
    expect(createdMessage.body.attachments.length).toBe(1)

    const listedMessages = await callGateway<Message[]>({
      method: "GET",
      path: `/v1/direct-threads/${thread.body.id}/messages`,
      token: alice.token
    })
    expect(listedMessages.status).toBe(200)
    expect(listedMessages.body.some((message) => message.id === createdMessage.body.id)).toBe(true)

    const updatedReadMarker = await callGateway<ReadMarker>({
      method: "PUT",
      path: `/v1/direct-threads/${thread.body.id}/read-marker`,
      token: alice.token,
      body: {
        lastReadMessageId: createdMessage.body.id
      }
    })
    expect(updatedReadMarker.status).toBe(200)
    expect(updatedReadMarker.body.lastReadMessageId).toBe(createdMessage.body.id)

    const fetchedReadMarker = await callGateway<ReadMarker>({
      method: "GET",
      path: `/v1/direct-threads/${thread.body.id}/read-marker`,
      token: alice.token
    })
    expect(fetchedReadMarker.status).toBe(200)
    expect(fetchedReadMarker.body.lastReadMessageId).toBe(createdMessage.body.id)

    const typing = await callGateway<TypingIndicator>({
      method: "POST",
      path: `/v1/direct-threads/${thread.body.id}/typing`,
      token: alice.token,
      body: {
        isTyping: true
      }
    })
    expect(typing.status).toBe(200)
    expect(typing.body.conversationId).toBe(thread.body.id)

    const createdEvents = eventsOfType(socketEvents, "message.created")
    const typingEvents = eventsOfType(socketEvents, "typing.updated")

    expect(createdEvents.length).toBe(1)
    expect(typingEvents.length).toBe(1)
    expect(serviceHits.messaging).toBeGreaterThan(hitsBefore.messaging)
    expect(serviceHits.media).toBeGreaterThan(hitsBefore.media)
  })

  it("proxies presence endpoints through the dedicated presence-service", async () => {
    const hitsBeforePresence = serviceHits.presence
    const actor = await registerUser("presenceactor")
    const watcher = await registerUser("presencewatcher")

    const friendRequest = await callGateway<FriendRequest>({
      method: "POST",
      path: "/v1/friends/requests",
      token: actor.token,
      body: {
        userId: watcher.user.id
      }
    })
    expect(friendRequest.status).toBe(201)

    const accepted = await callGateway<FriendRequest>({
      method: "POST",
      path: `/v1/friends/requests/${friendRequest.body.id}`,
      token: watcher.token,
      body: {
        action: "accept"
      }
    })
    expect(accepted.status).toBe(200)

    const watcherEvents = attachRealtimeCollector(watcher.user.id)

    const updated = await callGateway<PresenceState>({
      method: "PUT",
      path: "/v1/presence",
      token: actor.token,
      body: {
        status: "idle"
      }
    })

    expect(updated.status).toBe(200)
    expect(updated.body.userId).toBe(actor.user.id)
    expect(updated.body.status).toBe("idle")

    const presenceEvents = eventsOfType(watcherEvents, "presence.updated")
    expect(presenceEvents.length).toBe(1)
    expect((presenceEvents[0]?.payload as PresenceState).userId).toBe(actor.user.id)

    const mePresence = await callGateway<PresenceState>({
      method: "GET",
      path: "/v1/presence/me",
      token: actor.token
    })

    expect(mePresence.status).toBe(200)
    expect(mePresence.body.userId).toBe(actor.user.id)

    const bulkPresence = await callGateway<PresenceState[]>({
      method: "POST",
      path: "/v1/presence/bulk",
      token: actor.token,
      body: {
        userIds: [actor.user.id, watcher.user.id, "usr_unknown"]
      }
    })

    expect(bulkPresence.status).toBe(200)
    expect(bulkPresence.body.length).toBe(3)

    const singlePresence = await callGateway<PresenceState>({
      method: "GET",
      path: `/v1/presence/${actor.user.id}`,
      token: actor.token
    })

    expect(singlePresence.status).toBe(200)
    expect(singlePresence.body.userId).toBe(actor.user.id)
    expect(serviceHits.presence).toBeGreaterThan(hitsBeforePresence)
  })

  it("supports voice channels, calls, and realtime voice state updates", async () => {
    const hitsBeforeVoice = serviceHits.voice

    const owner = await registerUser("voiceowner")
    const member = await registerUser("voicemember")

    const createdServer = await callGateway<Server>({
      method: "POST",
      path: "/v1/servers",
      token: owner.token,
      body: { name: `voice-${createUniqueSuffix()}` }
    })
    expect(createdServer.status).toBe(201)

    const voiceChannel = await callGateway<Channel>({
      method: "POST",
      path: `/v1/servers/${createdServer.body.id}/channels`,
      token: owner.token,
      body: {
        name: `voice-${createUniqueSuffix().slice(0, 6)}`,
        type: "voice"
      }
    })
    expect(voiceChannel.status).toBe(201)
    expect(voiceChannel.body.type).toBe("voice")

    const invite = await callGateway<ServerInvite>({
      method: "POST",
      path: `/v1/servers/${createdServer.body.id}/invites`,
      token: owner.token,
      body: {}
    })
    expect(invite.status).toBe(201)

    const joined = await callGateway<Server>({
      method: "POST",
      path: `/v1/invites/${invite.body.code}/join`,
      token: member.token
    })
    expect(joined.status).toBe(200)

    const memberVoiceEvents = attachRealtimeCollector(member.user.id, voiceChannel.body.id)

    const joinedVoice = await callGateway<VoiceSession>({
      method: "POST",
      path: `/v1/voice/channels/${voiceChannel.body.id}/join`,
      token: owner.token,
      body: {
        muted: false,
        deafened: false,
        speaking: true
      }
    })
    expect(joinedVoice.status).toBe(200)
    expect(joinedVoice.body.targetKind).toBe("channel")
    expect(joinedVoice.body.targetId).toBe(voiceChannel.body.id)
    expect(joinedVoice.body.participants.some((participant) => participant.userId === owner.user.id)).toBe(true)

    const updatedVoiceState = await callGateway<VoiceSession>({
      method: "POST",
      path: `/v1/voice/channels/${voiceChannel.body.id}/state`,
      token: owner.token,
      body: {
        muted: true,
        speaking: false
      }
    })
    expect(updatedVoiceState.status).toBe(200)
    expect(
      updatedVoiceState.body.participants.find((participant) => participant.userId === owner.user.id)?.muted
    ).toBe(true)

    const screenShareState = await callGateway<VoiceSession>({
      method: "POST",
      path: `/v1/voice/channels/${voiceChannel.body.id}/screen-share`,
      token: owner.token,
      body: {
        screenSharing: true
      }
    })
    expect(screenShareState.status).toBe(200)
    expect(
      screenShareState.body.participants.find((participant) => participant.userId === owner.user.id)?.screenSharing
    ).toBe(true)

    const memberJoinedVoice = await callGateway<VoiceSession>({
      method: "POST",
      path: `/v1/voice/channels/${voiceChannel.body.id}/join`,
      token: member.token,
      body: {}
    })
    expect(memberJoinedVoice.status).toBe(200)
    expect(memberJoinedVoice.body.participants.some((participant) => participant.userId === member.user.id)).toBe(true)

    const voiceRealtimeEvents = eventsOfType(memberVoiceEvents, "voice.session.updated")
    expect(voiceRealtimeEvents.length).toBeGreaterThan(0)

    const ownerLeftVoice = await callGateway<VoiceSession>({
      method: "POST",
      path: `/v1/voice/channels/${voiceChannel.body.id}/leave`,
      token: owner.token,
      body: {}
    })
    expect(ownerLeftVoice.status).toBe(200)
    expect(ownerLeftVoice.body.participants.some((participant) => participant.userId === owner.user.id)).toBe(false)

    const directThread = await callGateway<DirectThread>({
      method: "POST",
      path: "/v1/direct-threads",
      token: owner.token,
      body: {
        participantIds: [member.user.id]
      }
    })
    expect(directThread.status).toBe(201)

    const joinedCall = await callGateway<VoiceSession>({
      method: "POST",
      path: `/v1/voice/direct-threads/${directThread.body.id}/join`,
      token: owner.token,
      body: {
        speaking: false
      }
    })
    expect(joinedCall.status).toBe(200)
    expect(joinedCall.body.targetKind).toBe("direct_thread")
    expect(joinedCall.body.targetId).toBe(directThread.body.id)

    const heartbeat = await callGateway<VoiceSession>({
      method: "POST",
      path: `/v1/voice/direct-threads/${directThread.body.id}/heartbeat`,
      token: owner.token,
      body: {
        speaking: true
      }
    })
    expect(heartbeat.status).toBe(200)
    expect(heartbeat.body.participants.find((participant) => participant.userId === owner.user.id)?.speaking).toBe(true)

    const leftCall = await callGateway<VoiceSession>({
      method: "POST",
      path: `/v1/voice/direct-threads/${directThread.body.id}/leave`,
      token: owner.token,
      body: {}
    })
    expect(leftCall.status).toBe(200)
    expect(leftCall.body.participants.some((participant) => participant.userId === owner.user.id)).toBe(false)

    expect(serviceHits.voice).toBeGreaterThan(hitsBeforeVoice)
  })

  it("supports push subscription CRUD via gateway", async () => {
    const auth = await registerUser("pushsub")

    const created = await callGateway<PushSubscription>({
      method: "POST",
      path: "/v1/notifications/push-subscriptions",
      token: auth.token,
      body: {
        endpoint: `https://example.com/push/${createUniqueSuffix()}`,
        keys: {
          p256dh: createUniqueSuffix(),
          auth: createUniqueSuffix()
        }
      }
    })

    expect(created.status).toBe(201)
    expect(created.body.userId).toBe(auth.user.id)

    const listed = await callGateway<PushSubscription[]>({
      method: "GET",
      path: "/v1/notifications/push-subscriptions",
      token: auth.token
    })

    expect(listed.status).toBe(200)
    expect(listed.body.some((item) => item.id === created.body.id)).toBe(true)

    const removed = await callGateway<{ status: string }>({
      method: "DELETE",
      path: `/v1/notifications/push-subscriptions/${created.body.id}`,
      token: auth.token
    })

    expect(removed.status).toBe(200)
    expect(removed.body.status).toBe("ok")

    const listedAfterDelete = await callGateway<PushSubscription[]>({
      method: "GET",
      path: "/v1/notifications/push-subscriptions",
      token: auth.token
    })

    expect(listedAfterDelete.status).toBe(200)
    expect(listedAfterDelete.body.some((item) => item.id === created.body.id)).toBe(false)
  })

  it("supports moderation actions with audit logs and ban enforcement", async () => {
    const owner = await registerUser("modowner")
    const target = await registerUser("modtarget")

    const bootstrap = await bootstrapServerAndChannel(owner.token, "moderation")

    const invite = await callGateway<ServerInvite>({
      method: "POST",
      path: `/v1/servers/${bootstrap.server.id}/invites`,
      token: owner.token,
      body: {}
    })
    expect(invite.status).toBe(201)

    const joined = await callGateway<Server>({
      method: "POST",
      path: `/v1/invites/${invite.body.code}/join`,
      token: target.token
    })
    expect(joined.status).toBe(200)

    const banned = await callGateway<ModerationAction>({
      method: "POST",
      path: `/v1/servers/${bootstrap.server.id}/moderation/actions`,
      token: owner.token,
      body: {
        targetUserId: target.user.id,
        actionType: "ban",
        reason: "spam"
      } satisfies CreateModerationActionRequest
    })

    expect(banned.status).toBe(201)
    expect(banned.body.actionType).toBe("ban")
    expect(banned.body.targetUserId).toBe(target.user.id)

    const membersAfterBan = await callGateway<User[]>({
      method: "GET",
      path: `/v1/servers/${bootstrap.server.id}/members`,
      token: owner.token
    })

    expect(membersAfterBan.status).toBe(200)
    expect(membersAfterBan.body.some((member) => member.id === target.user.id)).toBe(false)

    const auditLogs = await callGateway<AuditLogEntry[]>({
      method: "GET",
      path: `/v1/servers/${bootstrap.server.id}/audit-logs`,
      token: owner.token
    })

    expect(auditLogs.status).toBe(200)
    expect(
      auditLogs.body.some(
        (entry) => entry.actionType.includes("ban") && entry.targetUserId === target.user.id
      )
    ).toBe(true)

    const rejoin = await callGateway<Server | { error: string }>({
      method: "POST",
      path: `/v1/invites/${invite.body.code}/join`,
      token: target.token
    })

    expect(rejoin.status).toBe(404)
  })

  it("supports gateway search over channels and messages", async () => {
    const auth = await registerUser("search")
    const bootstrap = await bootstrapServerAndChannel(auth.token, "search")

    const createdMessage = await callGateway<Message>({
      method: "POST",
      path: `/v1/channels/${bootstrap.channel.id}/messages`,
      token: auth.token,
      body: {
        body: "release2-search-token"
      } satisfies CreateMessageRequest
    })
    expect(createdMessage.status).toBe(201)

    const search = await callGateway<SearchResults>({
      method: "GET",
      path: `/v1/search?q=${encodeURIComponent("release2-search-token")}&scope=all`,
      token: auth.token
    })

    expect(search.status).toBe(200)
    expect(search.body.messages.some((message) => message.id === createdMessage.body.id)).toBe(true)
    expect(search.body.channels.some((channel) => channel.id === bootstrap.channel.id)).toBe(false)
  })

  it("routes through dedicated services and falls back when messaging service is unavailable", async () => {
    const register = await registerUser("fallback")
    expect(serviceHits.identity).toBeGreaterThan(0)

    const bootstrap = await bootstrapServerAndChannel(register.token, "fallback-server")
    expect(serviceHits.community).toBeGreaterThan(0)

    const socketEvents = attachRealtimeCollector(register.user.id, bootstrap.channel.id)

    const createdMessage = await callGateway<Message>({
      method: "POST",
      path: `/v1/channels/${bootstrap.channel.id}/messages`,
      token: register.token,
      body: { body: "hello through proxy" } satisfies CreateMessageRequest
    })

    expect(createdMessage.status).toBe(201)
    expect(serviceHits.messaging).toBeGreaterThan(0)

    const proxiedRealtimeEvents = eventsOfType(socketEvents, "message.created")
    expect(proxiedRealtimeEvents.length).toBe(1)

    const messagingHitsBeforeFallback = serviceHits.messaging
    messagingServer?.stop(true)
    messagingServer = null

    const fallbackMessage = await callGateway<Message>({
      method: "POST",
      path: `/v1/channels/${bootstrap.channel.id}/messages`,
      token: register.token,
      body: { body: "hello through fallback" } satisfies CreateMessageRequest
    })

    expect(fallbackMessage.status).toBe(201)
    expect(serviceHits.messaging).toBe(messagingHitsBeforeFallback)

    const listedMessages = await callGateway<Message[]>({
      method: "GET",
      path: `/v1/channels/${bootstrap.channel.id}/messages`,
      token: register.token
    })

    expect(listedMessages.status).toBe(200)
    expect(listedMessages.body.length).toBe(2)
    expect(new Set(listedMessages.body.map((message) => message.id)).size).toBe(2)
  })
})
