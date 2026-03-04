import { traceHeader } from "../observability/trace"

export async function withTraceResponse(
  response: Response,
  traceId: string,
  includeInErrorPayload: boolean
): Promise<Response> {
  let responseWithHeader = response
  try {
    responseWithHeader.headers.set(traceHeader(), traceId)
  } catch {
    const headers = new Headers(response.headers)
    headers.set(traceHeader(), traceId)
    responseWithHeader = new Response(response.body, {
      status: response.status,
      headers
    })
  }

  if (!includeInErrorPayload || responseWithHeader.status < 400) {
    return responseWithHeader
  }

  const contentType = responseWithHeader.headers.get("content-type")?.toLowerCase() ?? ""
  if (!contentType.includes("application/json")) {
    return responseWithHeader
  }

  const raw = await responseWithHeader.clone().text()
  if (!raw.trim()) {
    return responseWithHeader
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return responseWithHeader
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return responseWithHeader
  }

  const payload = parsed as Record<string, unknown>
  if (typeof payload.traceId === "string" && payload.traceId.trim().length > 0) {
    return responseWithHeader
  }

  const headers = new Headers(responseWithHeader.headers)
  headers.set("Content-Type", "application/json")
  return new Response(JSON.stringify({ ...payload, traceId }), {
    status: responseWithHeader.status,
    headers
  })
}
