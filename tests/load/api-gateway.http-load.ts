type LoadSample = {
  durationMs: number
  status: number
}

const apiPort = 5201
const targetBaseUrl = `http://localhost:${apiPort}`

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

async function runLoad(concurrency: number, requestsPerWorker: number): Promise<LoadSample[]> {
  const workers = Array.from({ length: concurrency }, async () => {
    const samples: LoadSample[] = []

    for (let i = 0; i < requestsPerWorker; i += 1) {
      const startedAt = performance.now()
      const response = await fetch(`${targetBaseUrl}/health`)
      const durationMs = performance.now() - startedAt
      samples.push({
        durationMs,
        status: response.status
      })
    }

    return samples
  })

  const perWorker = await Promise.all(workers)
  return perWorker.flat()
}

async function main(): Promise<void> {
  const concurrency = Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY ?? 30))
  const requestsPerWorker = Math.max(1, Number(process.env.LOAD_TEST_REQUESTS_PER_WORKER ?? 40))
  const p95ThresholdMs = Math.max(1, Number(process.env.LOAD_TEST_P95_THRESHOLD_MS ?? 250))

  const proc = Bun.spawn(["bun", "services/api-gateway/src/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_GATEWAY_PORT: String(apiPort),
      STORE_MODE: "memory",
      ALLOW_MEMORY_FALLBACK: "true",
      DISABLE_RATE_LIMITING: "true",
      ENABLE_STRUCTURED_LOGGING: "false",
      PREFER_IDENTITY_SERVICE_PROXY: "false",
      PREFER_COMMUNITY_SERVICE_PROXY: "false",
      PREFER_MESSAGING_SERVICE_PROXY: "false",
      PREFER_MEDIA_SERVICE_PROXY: "false",
      PREFER_PRESENCE_SERVICE_PROXY: "false",
      PREFER_VOICE_SIGNALING_PROXY: "false",
      PREFER_REALTIME_GATEWAY_FANOUT: "false"
    },
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore"
  })

  try {
    await waitForHealth(`${targetBaseUrl}/health`, 30_000)
    const samples = await runLoad(concurrency, requestsPerWorker)
    const durations = samples.map((sample) => sample.durationMs)
    const totalRequests = samples.length
    const failures = samples.filter((sample) => sample.status >= 400).length
    const p95 = percentile(durations, 95)
    const p99 = percentile(durations, 99)
    const average =
      durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length)

    console.log(
      JSON.stringify(
        {
          totalRequests,
          failures,
          averageMs: Number(average.toFixed(2)),
          p95Ms: Number(p95.toFixed(2)),
          p99Ms: Number(p99.toFixed(2)),
          concurrency,
          requestsPerWorker
        },
        null,
        2
      )
    )

    if (failures > 0) {
      throw new Error(`Load test failed: ${failures} requests returned error responses.`)
    }

    if (p95 > p95ThresholdMs) {
      throw new Error(`Load test failed: p95 ${p95.toFixed(2)}ms exceeded ${p95ThresholdMs}ms threshold.`)
    }
  } finally {
    try {
      proc.kill()
    } catch {
      // ignore shutdown issues
    }
    await proc.exited
  }
}

void main().catch((reason) => {
  console.error("[load] failed:", reason instanceof Error ? reason.message : reason)
  process.exit(1)
})
