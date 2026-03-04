import type {
  NormalizedAttachmentInput,
  UploadTokenRecord,
  UploadTokenResponse
} from "./domain"

const minTokenTtlSeconds = 30
const maxTokenTtlSeconds = 60 * 60

function clampTtl(ttlSeconds: number): number {
  return Math.max(minTokenTtlSeconds, Math.min(ttlSeconds, maxTokenTtlSeconds))
}

type IssuedToken = UploadTokenRecord & {
  expiresAtMs: number
}

export class UploadTokenStore {
  private readonly tokensByValue = new Map<string, IssuedToken>()

  constructor(private readonly defaultTtlSeconds: number) {}

  issue(
    input: NormalizedAttachmentInput,
    requestedTtlSeconds: number | undefined
  ): UploadTokenResponse {
    this.pruneExpired()

    const ttl = clampTtl(requestedTtlSeconds ?? this.defaultTtlSeconds)
    const token = `up_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
    const expiresAtMs = Date.now() + ttl * 1_000
    const expiresAt = new Date(expiresAtMs).toISOString()

    this.tokensByValue.set(token, {
      token,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedBy: input.uploadedBy,
      expiresAt,
      expiresAtMs
    })

    return {
      token,
      expiresAt,
      constraints: {
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes
      },
      uploadUrl: `/v1/uploads/${token}`
    }
  }

  consume(token: string, input: NormalizedAttachmentInput): string | null {
    this.pruneExpired()

    const trimmed = token.trim()
    if (!trimmed) {
      return "uploadToken is required."
    }

    const issued = this.tokensByValue.get(trimmed)
    if (!issued) {
      return "uploadToken is invalid or expired."
    }

    if (issued.fileName !== input.fileName) {
      return "uploadToken fileName does not match request."
    }

    if (issued.contentType !== input.contentType) {
      return "uploadToken contentType does not match request."
    }

    if (issued.sizeBytes !== input.sizeBytes) {
      return "uploadToken sizeBytes does not match request."
    }

    this.tokensByValue.delete(trimmed)
    return null
  }

  pruneExpired(nowMs: number = Date.now()): void {
    for (const [token, issued] of this.tokensByValue.entries()) {
      if (issued.expiresAtMs <= nowMs) {
        this.tokensByValue.delete(token)
      }
    }
  }
}
