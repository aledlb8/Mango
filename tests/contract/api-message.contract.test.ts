import { beforeAll, describe, expect, it } from "bun:test"
import type { Message } from "@mango/contracts"

type RouteContext = {
  service: string
  corsOrigin: string
  store: unknown
  realtimeHub: unknown
}

type RouteFn = (request: Request, ctx: RouteContext) => Promise<Response>

let routeRequest: RouteFn
let context: RouteContext

async function call<T>(params: {
  method: string
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

  const response = await routeRequest(request, context)
  return {
    status: response.status,
    body: (await response.json()) as T
  }
}

function assertMessageContract(value: unknown): asserts value is Message {
  const payload = value as Record<string, unknown>
  expect(typeof payload.id).toBe("string")
  expect(typeof payload.channelId).toBe("string")
  expect(typeof payload.conversationId).toBe("string")
  expect(typeof payload.authorId).toBe("string")
  expect(typeof payload.body).toBe("string")
  expect(Array.isArray(payload.attachments)).toBe(true)
  expect(Array.isArray(payload.reactions)).toBe(true)
  expect(typeof payload.createdAt).toBe("string")
  expect(payload.updatedAt === null || typeof payload.updatedAt === "string").toBe(true)
}

describe("message response contract", () => {
  beforeAll(async () => {
    process.env.DISABLE_RATE_LIMITING = "true"
    process.env.PREFER_IDENTITY_SERVICE_PROXY = "false"
    process.env.PREFER_COMMUNITY_SERVICE_PROXY = "false"
    process.env.PREFER_MESSAGING_SERVICE_PROXY = "false"
    process.env.PREFER_MEDIA_SERVICE_PROXY = "false"
    process.env.PREFER_PRESENCE_SERVICE_PROXY = "false"
    process.env.PREFER_VOICE_SIGNALING_PROXY = "false"
    process.env.PREFER_REALTIME_GATEWAY_FANOUT = "false"

    const [{ routeRequest: importedRoute }, { MemoryStore }, { RealtimeHub }] = await Promise.all([
      import("../../services/api-gateway/src/router"),
      import("../../services/api-gateway/src/data/memory-store"),
      import("../../services/api-gateway/src/realtime/hub")
    ])

    routeRequest = importedRoute as RouteFn
    context = {
      service: "api-gateway",
      corsOrigin: "*",
      store: new MemoryStore(),
      realtimeHub: new RealtimeHub()
    }
  })

  it("returns message payload matching contract fields", async () => {
    const register = await call<{ token: string }>({
      method: "POST",
      path: "/v1/auth/register",
      body: {
        email: `contract-${crypto.randomUUID()}@example.com`,
        username: `contract_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
        displayName: "Contract User",
        password: "password123"
      }
    })
    expect(register.status).toBe(201)

    const server = await call<{ id: string }>({
      method: "POST",
      path: "/v1/servers",
      token: register.body.token,
      body: {
        name: "contract-server"
      }
    })
    expect(server.status).toBe(201)

    const channel = await call<{ id: string }>({
      method: "POST",
      path: `/v1/servers/${server.body.id}/channels`,
      token: register.body.token,
      body: {
        name: "general"
      }
    })
    expect(channel.status).toBe(201)

    const messageResponse = await call<Message>({
      method: "POST",
      path: `/v1/channels/${channel.body.id}/messages`,
      token: register.body.token,
      body: {
        body: "contract test message"
      }
    })
    expect(messageResponse.status).toBe(201)
    assertMessageContract(messageResponse.body)
  })
})
