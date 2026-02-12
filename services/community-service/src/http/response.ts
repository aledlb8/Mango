import type { ErrorResponse } from "@mango/contracts"

export function corsHeaders(corsOrigin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  }
}

export function json<T>(corsOrigin: string, status: number, body: T): Response {
  return Response.json(body, {
    status,
    headers: corsHeaders(corsOrigin)
  })
}

export function error(corsOrigin: string, status: number, message: string): Response {
  return json<ErrorResponse>(corsOrigin, status, { error: message })
}
