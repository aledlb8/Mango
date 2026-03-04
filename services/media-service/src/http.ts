export function corsHeaders(corsOrigin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  }
}

export function json(corsOrigin: string, status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: corsHeaders(corsOrigin)
  })
}

export function error(corsOrigin: string, status: number, message: string): Response {
  return json(corsOrigin, status, { error: message })
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
