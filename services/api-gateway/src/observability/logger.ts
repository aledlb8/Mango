type RequestLogLevel = "info" | "error"

export type RequestLogEntry = {
  level: RequestLogLevel
  service: string
  traceId: string
  method: string
  path: string
  status: number
  durationMs: number
  message?: string
}

export function logRequest(entry: RequestLogEntry): void {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry
  })

  if (entry.level === "error") {
    console.error(payload)
    return
  }

  console.log(payload)
}
