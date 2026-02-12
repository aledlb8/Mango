import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import type {
  AddReactionRequest,
  AuthResponse,
  Channel,
  ChannelPermissionOverwrite,
  CreateMessageRequest,
  CreateRoleRequest,
  CreateServerRequest,
  Message,
  Role,
  Server,
  ServerInvite,
  User
} from "@mango/contracts"
import { MemoryStore } from "./data/memory-store"
import { RealtimeHub } from "./realtime/hub"
import { routeRequest as routeCommunityRequest } from "../../community-service/src/router"
import { routeRequest as routeIdentityRequest } from "../../identity-service/src/router"
import { routeRequest as routeMessagingRequest } from "../../messaging-service/src/router"

type GatewayRouteFn = (request: Request, ctx: unknown) => Promise<Response>

type ServiceHits = {
  identity: number
  community: number
  messaging: number
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
  messaging: 0
}

let identityServer: ReturnType<typeof Bun.serve> | null = null
let communityServer: ReturnType<typeof Bun.serve> | null = null
let messagingServer: ReturnType<typeof Bun.serve> | null = null
let routeGatewayRequest: GatewayRouteFn

const originalEnv = {
  IDENTITY_SERVICE_URL: process.env.IDENTITY_SERVICE_URL,
  COMMUNITY_SERVICE_URL: process.env.COMMUNITY_SERVICE_URL,
  MESSAGING_SERVICE_URL: process.env.MESSAGING_SERVICE_URL,
  PREFER_IDENTITY_SERVICE_PROXY: process.env.PREFER_IDENTITY_SERVICE_PROXY,
  PREFER_COMMUNITY_SERVICE_PROXY: process.env.PREFER_COMMUNITY_SERVICE_PROXY,
  PREFER_MESSAGING_SERVICE_PROXY: process.env.PREFER_MESSAGING_SERVICE_PROXY
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

function attachRealtimeCollector(userId: string, channelId: string): SocketEvent[] {
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

  realtimeHub.addSubscription(fakeSocket as never, channelId)
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

    process.env.IDENTITY_SERVICE_URL = `http://127.0.0.1:${identityServer.port}`
    process.env.COMMUNITY_SERVICE_URL = `http://127.0.0.1:${communityServer.port}`
    process.env.MESSAGING_SERVICE_URL = `http://127.0.0.1:${messagingServer.port}`
    process.env.PREFER_IDENTITY_SERVICE_PROXY = "true"
    process.env.PREFER_COMMUNITY_SERVICE_PROXY = "true"
    process.env.PREFER_MESSAGING_SERVICE_PROXY = "true"

    const gatewayModule = await import("./router")
    routeGatewayRequest = gatewayModule.routeRequest as GatewayRouteFn
  })

  afterAll(() => {
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
