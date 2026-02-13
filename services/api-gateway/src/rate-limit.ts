type RateLimitBucket = {
  count: number
  resetAt: number
}

type RateLimitRule = {
  id: string
  limit: number
  windowMs: number
}

type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
}

const buckets = new Map<string, RateLimitBucket>()

function isRateLimitingDisabled(): boolean {
  return process.env.DISABLE_RATE_LIMITING === "true"
}

function readClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown"
  }

  const realIp = request.headers.get("x-real-ip")
  if (realIp) {
    return realIp.trim()
  }

  return "unknown"
}

function readRateLimitIdentity(request: Request): string {
  const authorization = request.headers.get("authorization")
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : ""
  if (token) {
    return `token:${token}`
  }

  return `ip:${readClientIp(request)}`
}

function classifyRule(request: Request): RateLimitRule {
  const { pathname } = new URL(request.url)
  const method = request.method.toUpperCase()

  if (method === "POST" && (pathname === "/v1/auth/login" || pathname === "/v1/auth/register")) {
    return {
      id: "auth",
      limit: 15,
      windowMs: 60_000
    }
  }

  if (method === "POST" && /\/v1\/(channels\/[^/]+|direct-threads\/[^/]+)\/messages$/.test(pathname)) {
    return {
      id: "messages.create",
      limit: 30,
      windowMs: 10_000
    }
  }

  if (method === "POST" && /\/v1\/(channels\/[^/]+|direct-threads\/[^/]+)\/typing$/.test(pathname)) {
    return {
      id: "typing",
      limit: 60,
      windowMs: 10_000
    }
  }

  if ((method === "POST" || method === "DELETE") && /\/v1\/messages\/[^/]+\/reactions/.test(pathname)) {
    return {
      id: "reactions",
      limit: 40,
      windowMs: 10_000
    }
  }

  return {
    id: "default",
    limit: 300,
    windowMs: 60_000
  }
}

function cleanupIfNeeded(now: number): void {
  if (buckets.size <= 10_000) {
    return
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function checkRateLimit(request: Request): RateLimitResult {
  if (isRateLimitingDisabled()) {
    return {
      allowed: true,
      retryAfterSeconds: 0
    }
  }

  const now = Date.now()
  cleanupIfNeeded(now)

  const rule = classifyRule(request)
  const identity = readRateLimitIdentity(request)
  const bucketKey = `${rule.id}:${identity}`
  const existing = buckets.get(bucketKey)

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: now + rule.windowMs
    })
    return {
      allowed: true,
      retryAfterSeconds: 0
    }
  }

  if (existing.count >= rule.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    }
  }

  existing.count += 1
  buckets.set(bucketKey, existing)
  return {
    allowed: true,
    retryAfterSeconds: 0
  }
}
