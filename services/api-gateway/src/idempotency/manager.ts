import { createHash } from "node:crypto"
import { corsHeaders, error } from "../http/response"
import type {
  IdempotencyLookupParams,
  IdempotencyLookupResult,
  IdempotencyStore,
  StoredIdempotencyResponse
} from "./store"

type ExecuteInput = IdempotencyLookupParams & {
  corsOrigin: string
}

type InFlightEntry = {
  pending: Promise<void>
  resolve: () => void
}

function createInFlightEntry(): InFlightEntry {
  let resolve!: () => void
  const pending = new Promise<void>((resolver) => {
    resolve = resolver
  })

  return {
    pending,
    resolve
  }
}

function responseFromStored(corsOrigin: string, stored: StoredIdempotencyResponse): Response {
  const headers = {
    ...corsHeaders(corsOrigin),
    "X-Idempotency-Replayed": "true"
  }

  if (stored.contentType) {
    ;(headers as Record<string, string>)["Content-Type"] = stored.contentType
  }

  return new Response(stored.body, {
    status: stored.status,
    headers
  })
}

async function storeResponse(
  store: IdempotencyStore,
  input: ExecuteInput,
  response: Response
): Promise<void> {
  const contentType = response.headers.get("content-type")
  const body = await response.clone().text()

  await store.save({
    ...input,
    response: {
      status: response.status,
      contentType,
      body
    }
  })
}

export class IdempotencyManager {
  private readonly inFlightByCompositeKey = new Map<string, InFlightEntry>()

  constructor(private readonly store: IdempotencyStore) {}

  async execute(
    input: ExecuteInput,
    executeRequest: () => Promise<Response>
  ): Promise<Response> {
    const compositeKey = `${input.userId}:${input.key}:${input.scope}`
    const previousEntry = this.inFlightByCompositeKey.get(compositeKey)
    if (previousEntry) {
      await previousEntry.pending
    }

    const entry = createInFlightEntry()
    this.inFlightByCompositeKey.set(compositeKey, entry)

    try {
      const lookup = await this.store.lookup(input)
      if (lookup.kind === "conflict") {
        return error(
          input.corsOrigin,
          409,
          "Idempotency key was already used with a different request payload."
        )
      }
      if (lookup.kind === "replay") {
        return responseFromStored(input.corsOrigin, lookup.response)
      }

      const response = await executeRequest()
      if (response.ok) {
        await storeResponse(this.store, input, response)
      }
      return response
    } finally {
      const currentEntry = this.inFlightByCompositeKey.get(compositeKey)
      if (currentEntry === entry) {
        this.inFlightByCompositeKey.delete(compositeKey)
      }
      entry.resolve()
    }
  }
}

export function hashRequestFingerprint(
  method: string,
  scope: string,
  payloadText: string
): string {
  return createHash("sha256")
    .update(`${method.toUpperCase()}:${scope}:${payloadText}`)
    .digest("hex")
}

export function isReplayResult(result: IdempotencyLookupResult): boolean {
  return result.kind === "replay"
}
