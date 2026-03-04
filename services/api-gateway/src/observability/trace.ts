import { randomUUID } from "node:crypto"

const traceHeaderName = "x-trace-id"

export function readOrCreateTraceId(request: Request): string {
  const provided = request.headers.get(traceHeaderName)?.trim()
  if (provided) {
    return provided
  }

  return randomUUID()
}

export function traceHeader(): string {
  return "X-Trace-Id"
}
