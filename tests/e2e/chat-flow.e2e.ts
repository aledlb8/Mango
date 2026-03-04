type RunningService = {
  label: string
  proc: Bun.Subprocess
}

const apiPort = 5101

const apiBaseUrl = `http://localhost:${apiPort}`

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // ignore until timeout
    }

    await Bun.sleep(200)
  }

  throw new Error(`Timed out waiting for health endpoint: ${url}`)
}

function startService(label: string, entrypoint: string, env: Record<string, string>): RunningService {
  const proc = Bun.spawn(["bun", entrypoint], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env
    },
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore"
  })

  return {
    label,
    proc
  }
}

async function shutdown(services: RunningService[]): Promise<void> {
  for (const service of services) {
    try {
      service.proc.kill()
    } catch {
      // ignore process shutdown errors
    }
  }

  await Promise.allSettled(services.map(async (service) => service.proc.exited))
}

async function request<T>(params: {
  method: string
  path: string
  token?: string
  body?: unknown
}): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json"
  }
  if (params.token) {
    ;(headers as Record<string, string>).Authorization = `Bearer ${params.token}`
  }

  const response = await fetch(`${apiBaseUrl}${params.path}`, {
    method: params.method,
    headers,
    body: params.body === undefined ? undefined : JSON.stringify(params.body)
  })

  if (!response.ok) {
    throw new Error(`Request failed (${params.method} ${params.path}): ${response.status} ${await response.text()}`)
  }

  return (await response.json()) as T
}

async function main(): Promise<void> {
  const commonEnv = {
    CORS_ORIGIN: "*",
    STORE_MODE: "memory",
    ALLOW_MEMORY_FALLBACK: "true",
    DISABLE_RATE_LIMITING: "true"
  }

  const services: RunningService[] = []

  try {
    services.push(
      startService("api-gateway", "services/api-gateway/src/index.ts", {
        ...commonEnv,
        API_GATEWAY_PORT: String(apiPort),
        ENABLE_STRUCTURED_LOGGING: "false",
        PREFER_IDENTITY_SERVICE_PROXY: "false",
        PREFER_COMMUNITY_SERVICE_PROXY: "false",
        PREFER_MESSAGING_SERVICE_PROXY: "false",
        PREFER_MEDIA_SERVICE_PROXY: "false",
        PREFER_PRESENCE_SERVICE_PROXY: "false",
        PREFER_VOICE_SIGNALING_PROXY: "false",
        PREFER_REALTIME_GATEWAY_FANOUT: "false"
      })
    )

    await waitForHealth(`http://localhost:${apiPort}/health`, 30_000)

    const register = await request<{ token: string; user: { id: string } }>({
      method: "POST",
      path: "/v1/auth/register",
      body: {
        email: `e2e-${crypto.randomUUID()}@example.com`,
        username: `e2e_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
        displayName: "E2E User",
        password: "password123"
      }
    })

    const server = await request<{ id: string }>({
      method: "POST",
      path: "/v1/servers",
      token: register.token,
      body: {
        name: "e2e-server"
      }
    })

    const channel = await request<{ id: string }>({
      method: "POST",
      path: `/v1/servers/${server.id}/channels`,
      token: register.token,
      body: {
        name: "general"
      }
    })

    await request({
      method: "POST",
      path: `/v1/channels/${channel.id}/messages`,
      token: register.token,
      body: {
        body: "hello from e2e"
      }
    })

    const messages = await request<Array<{ body: string }>>({
      method: "GET",
      path: `/v1/channels/${channel.id}/messages`,
      token: register.token
    })

    const found = messages.some((message) => message.body === "hello from e2e")
    if (!found) {
      throw new Error("E2E flow failed: created message not found in history.")
    }

    console.log("[e2e] chat flow passed")
  } finally {
    await shutdown(services)
  }
}

void main().catch((reason) => {
  console.error("[e2e] failed:", reason instanceof Error ? reason.message : reason)
  process.exit(1)
})
