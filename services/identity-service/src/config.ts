export const service = "identity-service"
export const port = Number(process.env.IDENTITY_SERVICE_PORT ?? 3002)
export const corsOrigin = process.env.CORS_ORIGIN ?? "*"
export const databaseUrl = process.env.DATABASE_URL ?? "postgres://mango:mango@localhost:5432/mango"
export const allowMemoryFallback = process.env.ALLOW_MEMORY_FALLBACK !== "false"
