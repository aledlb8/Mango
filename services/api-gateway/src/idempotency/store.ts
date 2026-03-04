import { SQL } from "bun"
import { allowMemoryFallback, databaseUrl, idempotencyKeyTtlSeconds, storeMode } from "../config"

export type StoredIdempotencyResponse = {
  status: number
  contentType: string | null
  body: string
}

export type IdempotencyLookupResult =
  | {
      kind: "miss"
    }
  | {
      kind: "conflict"
    }
  | {
      kind: "replay"
      response: StoredIdempotencyResponse
    }

export type IdempotencyLookupParams = {
  userId: string
  key: string
  scope: string
  fingerprint: string
}

export type IdempotencySaveParams = IdempotencyLookupParams & {
  response: StoredIdempotencyResponse
}

export interface IdempotencyStore {
  lookup(params: IdempotencyLookupParams): Promise<IdempotencyLookupResult>
  save(params: IdempotencySaveParams): Promise<void>
}

function normalizeCompositeKey(userId: string, key: string, scope: string): string {
  return `${userId}:${key}:${scope}`
}

type MemoryEntry = {
  userId: string
  key: string
  scope: string
  fingerprint: string
  response: StoredIdempotencyResponse
  expiresAtMs: number
}

class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entriesByCompositeKey = new Map<string, MemoryEntry>()

  constructor(private readonly ttlSeconds: number) {}

  async lookup(params: IdempotencyLookupParams): Promise<IdempotencyLookupResult> {
    this.pruneExpired()

    const compositeKey = normalizeCompositeKey(params.userId, params.key, params.scope)
    const entry = this.entriesByCompositeKey.get(compositeKey)
    if (!entry) {
      return {
        kind: "miss"
      }
    }

    if (entry.fingerprint !== params.fingerprint) {
      return {
        kind: "conflict"
      }
    }

    return {
      kind: "replay",
      response: entry.response
    }
  }

  async save(params: IdempotencySaveParams): Promise<void> {
    this.pruneExpired()
    const compositeKey = normalizeCompositeKey(params.userId, params.key, params.scope)
    if (this.entriesByCompositeKey.has(compositeKey)) {
      return
    }

    this.entriesByCompositeKey.set(compositeKey, {
      userId: params.userId,
      key: params.key,
      scope: params.scope,
      fingerprint: params.fingerprint,
      response: params.response,
      expiresAtMs: Date.now() + this.ttlSeconds * 1_000
    })
  }

  private pruneExpired(nowMs: number = Date.now()): void {
    for (const [compositeKey, entry] of this.entriesByCompositeKey.entries()) {
      if (entry.expiresAtMs <= nowMs) {
        this.entriesByCompositeKey.delete(compositeKey)
      }
    }
  }
}

type IdempotencyRow = {
  user_id: string
  idempotency_key: string
  scope: string
  fingerprint: string
  response_status: number
  response_content_type: string | null
  response_body: string
}

class PostgresIdempotencyStore implements IdempotencyStore {
  private saveCountSincePrune = 0

  private constructor(
    private readonly sql: SQL,
    private readonly ttlSeconds: number
  ) {}

  static async connect(dbUrl: string, ttlSeconds: number): Promise<PostgresIdempotencyStore> {
    const sql = new SQL(dbUrl)
    await sql`SELECT 1`
    await sql`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        user_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        scope TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        response_status INTEGER NOT NULL,
        response_content_type TEXT,
        response_body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (user_id, idempotency_key, scope)
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
      ON idempotency_keys (expires_at)
    `

    return new PostgresIdempotencyStore(sql, ttlSeconds)
  }

  async lookup(params: IdempotencyLookupParams): Promise<IdempotencyLookupResult> {
    const rows = await this.sql<IdempotencyRow[]>`
      SELECT
        user_id,
        idempotency_key,
        scope,
        fingerprint,
        response_status,
        response_content_type,
        response_body
      FROM idempotency_keys
      WHERE user_id = ${params.userId}
        AND idempotency_key = ${params.key}
        AND scope = ${params.scope}
        AND expires_at > NOW()
      LIMIT 1
    `

    const row = rows[0]
    if (!row) {
      return {
        kind: "miss"
      }
    }

    if (row.fingerprint !== params.fingerprint) {
      return {
        kind: "conflict"
      }
    }

    return {
      kind: "replay",
      response: {
        status: Number(row.response_status),
        contentType: row.response_content_type,
        body: row.response_body
      }
    }
  }

  async save(params: IdempotencySaveParams): Promise<void> {
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1_000).toISOString()
    await this.sql`
      INSERT INTO idempotency_keys (
        user_id,
        idempotency_key,
        scope,
        fingerprint,
        response_status,
        response_content_type,
        response_body,
        expires_at
      )
      VALUES (
        ${params.userId},
        ${params.key},
        ${params.scope},
        ${params.fingerprint},
        ${params.response.status},
        ${params.response.contentType},
        ${params.response.body},
        ${expiresAt}
      )
      ON CONFLICT (user_id, idempotency_key, scope) DO NOTHING
    `

    this.saveCountSincePrune += 1
    if (this.saveCountSincePrune >= 100) {
      this.saveCountSincePrune = 0
      await this.sql`
        DELETE FROM idempotency_keys
        WHERE expires_at <= NOW()
      `
    }
  }
}

export async function createIdempotencyStore(): Promise<IdempotencyStore> {
  if (storeMode === "memory") {
    return new MemoryIdempotencyStore(idempotencyKeyTtlSeconds)
  }

  try {
    return await PostgresIdempotencyStore.connect(databaseUrl, idempotencyKeyTtlSeconds)
  } catch (reason) {
    if (!allowMemoryFallback) {
      throw reason
    }

    console.warn("[api-gateway] postgres unavailable for idempotency store, falling back to memory.")
    if (reason instanceof Error) {
      console.warn(`[api-gateway] idempotency postgres error: ${reason.message}`)
    }
    return new MemoryIdempotencyStore(idempotencyKeyTtlSeconds)
  }
}
