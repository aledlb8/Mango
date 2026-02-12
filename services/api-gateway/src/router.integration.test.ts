import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import type { AuthResponse, Channel, CreateMessageRequest, CreateServerRequest, Message, Server } from "@mango/contracts"
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

  it("routes through dedicated services and falls back when messaging service is unavailable", async () => {
    const register = await callGateway<AuthResponse>({
      method: "POST",
      path: "/v1/auth/register",
      body: {
        email: "proxy-test@example.com",
        username: "proxy_user_01",
        displayName: "Proxy User",
        password: "password123"
      }
    })

    expect(register.status).toBe(201)
    expect(serviceHits.identity).toBeGreaterThan(0)

    const token = register.body.token
    expect(token.length).toBeGreaterThan(10)

    const createdServer = await callGateway<Server>({
      method: "POST",
      path: "/v1/servers",
      token,
      body: { name: "Proxy Test Server" } satisfies CreateServerRequest
    })

    expect(createdServer.status).toBe(201)
    expect(createdServer.body.name).toBe("Proxy Test Server")
    expect(serviceHits.community).toBeGreaterThan(0)

    const createdChannel = await callGateway<Channel>({
      method: "POST",
      path: `/v1/servers/${createdServer.body.id}/channels`,
      token,
      body: { name: "general" }
    })

    expect(createdChannel.status).toBe(201)
    expect(createdChannel.body.name).toBe("general")

    const socketEvents: Array<{ type?: string; payload?: unknown }> = []
    const fakeSocket: FakeSocket = {
      data: {
        userId: register.body.user.id,
        subscriptions: new Set<string>()
      },
      send(payload: string) {
        socketEvents.push(JSON.parse(payload) as { type?: string; payload?: unknown })
      }
    }

    realtimeHub.addSubscription(fakeSocket as never, createdChannel.body.id)

    const createdMessage = await callGateway<Message>({
      method: "POST",
      path: `/v1/channels/${createdChannel.body.id}/messages`,
      token,
      body: { body: "hello through proxy" } satisfies CreateMessageRequest
    })

    expect(createdMessage.status).toBe(201)
    expect(serviceHits.messaging).toBeGreaterThan(0)

    const proxiedRealtimeEvents = socketEvents.filter((event) => event.type === "message.created")
    expect(proxiedRealtimeEvents.length).toBe(1)

    const messagingHitsBeforeFallback = serviceHits.messaging
    messagingServer?.stop(true)
    messagingServer = null

    const fallbackMessage = await callGateway<Message>({
      method: "POST",
      path: `/v1/channels/${createdChannel.body.id}/messages`,
      token,
      body: { body: "hello through fallback" } satisfies CreateMessageRequest
    })

    expect(fallbackMessage.status).toBe(201)
    expect(serviceHits.messaging).toBe(messagingHitsBeforeFallback)

    const listedMessages = await callGateway<Message[]>({
      method: "GET",
      path: `/v1/channels/${createdChannel.body.id}/messages`,
      token
    })

    expect(listedMessages.status).toBe(200)
    expect(listedMessages.body.length).toBe(2)
    expect(new Set(listedMessages.body.map((message) => message.id)).size).toBe(2)
  })
})
