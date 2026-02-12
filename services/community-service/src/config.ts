export const service = "community-service"
export const port = Number(process.env.COMMUNITY_SERVICE_PORT ?? 3003)
export const corsOrigin = process.env.CORS_ORIGIN ?? "*"
export const storeMode = process.env.STORE_MODE ?? "postgres"
export const databaseUrl = process.env.DATABASE_URL ?? "postgres://mango:mango@localhost:5432/mango"
export const allowMemoryFallback = process.env.ALLOW_MEMORY_FALLBACK !== "false"
