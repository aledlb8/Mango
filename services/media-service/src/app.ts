import { createHealthResponse } from "@mango/contracts"
import type { MediaServiceConfig } from "./config"
import {
  type AttachmentCreateRequest,
  type CreateUploadTokenRequest
} from "./domain"
import { AttachmentStore } from "./attachment-store"
import { UploadTokenStore } from "./token-store"
import { corsHeaders, error, json, readJson } from "./http"
import { normalizeAttachmentInput } from "./validation"

export function createMediaServiceFetch(config: MediaServiceConfig): (request: Request) => Promise<Response> {
  const attachmentStore = new AttachmentStore(config.publicBaseUrl)
  const tokenStore = new UploadTokenStore(config.defaultUploadTokenTtlSeconds)

  return async function fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(config.corsOrigin)
      })
    }

    const { pathname } = new URL(request.url)
    tokenStore.pruneExpired()

    if (pathname === "/health" && request.method === "GET") {
      return json(config.corsOrigin, 200, createHealthResponse(config.service))
    }

    if (pathname === "/v1/uploads/tokens" && request.method === "POST") {
      const raw = await readJson<CreateUploadTokenRequest>(request)
      const { value, error: validationError } = normalizeAttachmentInput(raw, config.maxUploadBytes)
      if (!value) {
        return error(config.corsOrigin, 400, validationError ?? "Invalid upload token payload.")
      }

      const token = tokenStore.issue(value, raw?.expiresInSeconds)
      return json(config.corsOrigin, 201, token)
    }

    if (pathname === "/v1/attachments" && request.method === "POST") {
      const raw = await readJson<AttachmentCreateRequest>(request)
      const { value, error: validationError } = normalizeAttachmentInput(raw, config.maxUploadBytes)
      if (!value) {
        return error(config.corsOrigin, 400, validationError ?? "Invalid attachment payload.")
      }

      const uploadToken = raw?.uploadToken?.trim()
      if (config.requireUploadToken && !uploadToken) {
        return error(config.corsOrigin, 400, "uploadToken is required.")
      }

      if (uploadToken) {
        const tokenError = tokenStore.consume(uploadToken, value)
        if (tokenError) {
          return error(config.corsOrigin, 400, tokenError)
        }
      }

      const attachment = attachmentStore.create(value, Boolean(uploadToken))
      return json(config.corsOrigin, 201, attachment)
    }

    const metadataMatch = pathname.match(/^\/v1\/attachments\/([^/]+)\/metadata$/)
    if (metadataMatch?.[1] && request.method === "GET") {
      const metadata = attachmentStore.getMetadata(metadataMatch[1])
      if (!metadata) {
        return error(config.corsOrigin, 404, "Attachment metadata not found.")
      }

      return json(config.corsOrigin, 200, metadata)
    }

    const attachmentMatch = pathname.match(/^\/v1\/attachments\/([^/]+)$/)
    if (attachmentMatch?.[1] && request.method === "GET") {
      const attachment = attachmentStore.getAttachment(attachmentMatch[1])
      if (!attachment) {
        return error(config.corsOrigin, 404, "Attachment not found.")
      }

      return json(config.corsOrigin, 200, attachment)
    }

    return json(config.corsOrigin, 200, {
      service: config.service,
      message: "Media service is running.",
      routes: [
        "GET /health",
        "POST /v1/uploads/tokens",
        "POST /v1/attachments",
        "GET /v1/attachments/:attachmentId",
        "GET /v1/attachments/:attachmentId/metadata"
      ]
    })
  }
}
