import type { Attachment, CreateAttachmentRequest } from "@mango/contracts"
import { createHealthResponse } from "@mango/contracts"

const service = "media-service"
const port = Number(process.env.MEDIA_SERVICE_PORT ?? 3005)
const corsOrigin = process.env.CORS_ORIGIN ?? "*"

const attachmentsById = new Map<string, Attachment>()

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  }
}

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: corsHeaders()
  })
}

function error(status: number, message: string): Response {
  return json(status, { error: message })
}

function normalizeAttachmentInput(body: CreateAttachmentRequest | null): CreateAttachmentRequest | null {
  if (!body) {
    return null
  }

  const fileName = body.fileName?.trim()
  const contentType = body.contentType?.trim()
  const sizeBytes = Number(body.sizeBytes)
  if (!fileName || !contentType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return null
  }

  if (sizeBytes > 25 * 1024 * 1024) {
    return null
  }

  return {
    fileName,
    contentType,
    sizeBytes
  }
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

Bun.serve({
  port,
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      })
    }

    const { pathname } = new URL(request.url)

    if (pathname === "/health" && request.method === "GET") {
      return json(200, createHealthResponse(service))
    }

    if (pathname === "/v1/attachments" && request.method === "POST") {
      const raw = await readJson<CreateAttachmentRequest>(request)
      const payload = normalizeAttachmentInput(raw)
      if (!payload) {
        return error(400, "Invalid attachment payload.")
      }

      const id = `att_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
      const createdAt = new Date().toISOString()
      const attachment: Attachment = {
        id,
        fileName: payload.fileName,
        contentType: payload.contentType,
        sizeBytes: payload.sizeBytes,
        url: `/uploads/${id}/${encodeURIComponent(payload.fileName)}`,
        uploadedBy: "unknown",
        createdAt
      }

      attachmentsById.set(id, attachment)
      return json(201, attachment)
    }

    const attachmentMatch = pathname.match(/^\/v1\/attachments\/([^/]+)$/)
    if (attachmentMatch?.[1] && request.method === "GET") {
      const attachment = attachmentsById.get(attachmentMatch[1])
      if (!attachment) {
        return error(404, "Attachment not found.")
      }

      return json(200, attachment)
    }

    return json(200, {
      service,
      message: "Media service is running.",
      routes: [
        "GET /health",
        "POST /v1/attachments",
        "GET /v1/attachments/:attachmentId"
      ]
    })
  }
})

console.log(`${service} listening on http://localhost:${port}`)
