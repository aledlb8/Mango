type RunningService = {
  label: string
  proc: Bun.Subprocess
}

type RoundTracker = {
  startedAt: number
  receivedUserIds: Set<string>
  maxLatencyMs: number
}

const identityPort = 5302
const realtimePort = 5401
const internalApiKey = "load-test-key"
const realtimeBaseUrl = `http://localhost:${realtimePort}`
const realtimeWsUrl = `ws://localhost:${realtimePort}/v1/ws`

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

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

async function startIdentityStub(): Promise<ReturnType<typeof Bun.serve>> {
  const identity = Bun.serve({
    port: identityPort,
    fetch(request) {
      const { pathname } = new URL(request.url)

      if (pathname === "/health") {
        return Response.json({
          service: "identity-service-stub",
          status: "ok"
        })
      }

      if (pathname === "/v1/me" && request.method === "GET") {
        const authorization = request.headers.get("authorization") ?? ""
        const token = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : ""
        if (!token) {
          return Response.json({ error: "Unauthorized." }, { status: 401 })
        }

        return Response.json({ id: token })
      }

      return Response.json({ error: "Route not found." }, { status: 404 })
    }
  })

  await waitForHealth(`http://localhost:${identity.port}/health`, 15_000)
  return identity
}

function startRealtimeGateway(identityServiceUrl: string): RunningService {
  const proc = Bun.spawn(["go", "run", "."], {
    cwd: "services/realtime-gateway",
    env: {
      ...process.env,
      REALTIME_GATEWAY_PORT: String(realtimePort),
      CORS_ORIGIN: "*",
      REALTIME_GATEWAY_INTERNAL_API_KEY: internalApiKey,
      IDENTITY_SERVICE_URL: identityServiceUrl,
      MESSAGING_SERVICE_URL: `http://localhost:${identityPort}`
    },
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore"
  })

  return {
    label: "realtime-gateway",
    proc
  }
}

async function connectClient(
  userId: string,
  trackers: Map<string, RoundTracker>,
  timeoutMs: number
): Promise<WebSocket> {
  return await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(`${realtimeWsUrl}?token=${encodeURIComponent(userId)}`)
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error(`WebSocket ready timeout for user ${userId}`))
    }, timeoutMs)

    socket.addEventListener("open", () => {
      // wait for ready message
    })

    socket.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data)
      let parsed: { type?: string; payload?: { eventId?: string } }
      try {
        parsed = JSON.parse(raw) as { type?: string; payload?: { eventId?: string } }
      } catch {
        return
      }

      if (parsed.type === "ready") {
        clearTimeout(timeout)
        resolve(socket)
        return
      }

      if (parsed.type !== "fanout.load" || !parsed.payload?.eventId) {
        return
      }

      const tracker = trackers.get(parsed.payload.eventId)
      if (!tracker || tracker.receivedUserIds.has(userId)) {
        return
      }

      tracker.receivedUserIds.add(userId)
      const latencyMs = performance.now() - tracker.startedAt
      if (latencyMs > tracker.maxLatencyMs) {
        tracker.maxLatencyMs = latencyMs
      }
    })

    socket.addEventListener("error", () => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket error for user ${userId}`))
    })

    socket.addEventListener("close", () => {
      // ignore; test lifecycle handles failures via publish checks.
    })
  })
}

async function publishRound(
  eventId: string,
  recipients: string[],
  trackers: Map<string, RoundTracker>
): Promise<number> {
  trackers.set(eventId, {
    startedAt: performance.now(),
    receivedUserIds: new Set<string>(),
    maxLatencyMs: 0
  })

  const response = await fetch(`${realtimeBaseUrl}/internal/realtime/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Realtime-Internal-Key": internalApiKey
    },
    body: JSON.stringify({
      type: "fanout.load",
      payload: {
        eventId
      },
      recipientUserIds: recipients
    })
  })

  if (!response.ok) {
    throw new Error(`Realtime publish failed: ${response.status} ${await response.text()}`)
  }

  const payload = (await response.json()) as { delivered?: number }
  return Number(payload.delivered ?? 0)
}

async function waitForRoundDelivery(
  eventId: string,
  expectedReceivers: number,
  trackers: Map<string, RoundTracker>,
  timeoutMs: number
): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const tracker = trackers.get(eventId)
    if (tracker && tracker.receivedUserIds.size >= expectedReceivers) {
      return
    }
    await Bun.sleep(20)
  }

  const tracker = trackers.get(eventId)
  const received = tracker?.receivedUserIds.size ?? 0
  throw new Error(`Round ${eventId} timed out: received ${received}/${expectedReceivers} events.`)
}

async function main(): Promise<void> {
  const clients = Math.max(1, Number(process.env.WS_LOAD_CLIENTS ?? 80))
  const rounds = Math.max(1, Number(process.env.WS_LOAD_ROUNDS ?? 8))
  const p95ThresholdMs = Math.max(1, Number(process.env.WS_LOAD_P95_THRESHOLD_MS ?? 350))
  const roundTimeoutMs = Math.max(1_000, Number(process.env.WS_LOAD_ROUND_TIMEOUT_MS ?? 10_000))

  const identity = await startIdentityStub()
  const realtime = startRealtimeGateway(`http://localhost:${identity.port}`)
  const sockets: WebSocket[] = []
  const trackers = new Map<string, RoundTracker>()

  try {
    await waitForHealth(`${realtimeBaseUrl}/health`, 30_000)

    const recipients = Array.from({ length: clients }, (_, index) => `usr_load_${String(index + 1).padStart(4, "0")}`)
    const opened = await Promise.all(
      recipients.map((userId) => connectClient(userId, trackers, 10_000))
    )
    sockets.push(...opened)

    const deliveredCounts: number[] = []
    const allRoundMaxLatencies: number[] = []

    for (let round = 1; round <= rounds; round += 1) {
      const eventId = `evt_${round}`
      const delivered = await publishRound(eventId, recipients, trackers)
      deliveredCounts.push(delivered)
      await waitForRoundDelivery(eventId, recipients.length, trackers, roundTimeoutMs)

      const tracker = trackers.get(eventId)
      if (!tracker) {
        throw new Error(`Missing tracker for ${eventId}`)
      }
      allRoundMaxLatencies.push(tracker.maxLatencyMs)
    }

    const p95 = percentile(allRoundMaxLatencies, 95)
    const minDelivered = Math.min(...deliveredCounts)
    const maxDelivered = Math.max(...deliveredCounts)

    console.log(
      JSON.stringify(
        {
          clients,
          rounds,
          minDelivered,
          maxDelivered,
          p95RoundMaxLatencyMs: Number(p95.toFixed(2)),
          p99RoundMaxLatencyMs: Number(percentile(allRoundMaxLatencies, 99).toFixed(2))
        },
        null,
        2
      )
    )

    if (minDelivered < clients) {
      throw new Error(`WebSocket fanout load failed: min delivered ${minDelivered}/${clients}.`)
    }

    if (p95 > p95ThresholdMs) {
      throw new Error(`WebSocket fanout load failed: p95 ${p95.toFixed(2)}ms exceeded ${p95ThresholdMs}ms.`)
    }
  } finally {
    for (const socket of sockets) {
      try {
        socket.close()
      } catch {
        // ignore socket close errors
      }
    }

    try {
      realtime.proc.kill()
    } catch {
      // ignore shutdown issues
    }
    await realtime.proc.exited

    identity.stop(true)
  }
}

void main().catch((reason) => {
  console.error("[load:ws] failed:", reason instanceof Error ? reason.message : reason)
  process.exit(1)
})
