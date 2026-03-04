export type MediaServiceConfig = {
  service: string
  port: number
  corsOrigin: string
  maxUploadBytes: number
  defaultUploadTokenTtlSeconds: number
  requireUploadToken: boolean
  publicBaseUrl: string
}

export function loadConfig(): MediaServiceConfig {
  return {
    service: "media-service",
    port: Number(process.env.MEDIA_SERVICE_PORT ?? 3005),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    maxUploadBytes: Math.max(1, Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024)),
    defaultUploadTokenTtlSeconds: Math.max(
      30,
      Number(process.env.MEDIA_UPLOAD_TOKEN_TTL_SECONDS ?? 900)
    ),
    requireUploadToken: process.env.MEDIA_REQUIRE_UPLOAD_TOKEN === "true",
    publicBaseUrl: (process.env.MEDIA_PUBLIC_BASE_URL ?? "").trim()
  }
}
