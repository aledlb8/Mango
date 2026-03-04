import { FeatureFlagManager, type FeatureFlagDefinition } from "@mango/config"

export const service = "api-gateway"
export const port = Number(process.env.API_GATEWAY_PORT ?? 3001)
export const corsOrigin = process.env.CORS_ORIGIN ?? "*"
export const storeMode = process.env.STORE_MODE ?? "postgres"
export const databaseUrl = process.env.DATABASE_URL ?? "postgres://mango:mango@localhost:5432/mango"
export const allowMemoryFallback = process.env.ALLOW_MEMORY_FALLBACK !== "false"
export const identityServiceUrl = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3002"
export const preferIdentityServiceProxy = process.env.PREFER_IDENTITY_SERVICE_PROXY !== "false"
export const communityServiceUrl = process.env.COMMUNITY_SERVICE_URL ?? "http://localhost:3003"
export const preferCommunityServiceProxy = process.env.PREFER_COMMUNITY_SERVICE_PROXY !== "false"
export const messagingServiceUrl = process.env.MESSAGING_SERVICE_URL ?? "http://localhost:3004"
export const preferMessagingServiceProxy = process.env.PREFER_MESSAGING_SERVICE_PROXY !== "false"
export const mediaServiceUrl = process.env.MEDIA_SERVICE_URL ?? "http://localhost:3005"
export const preferMediaServiceProxy = process.env.PREFER_MEDIA_SERVICE_PROXY !== "false"
export const presenceServiceUrl = process.env.PRESENCE_SERVICE_URL ?? "http://localhost:4002"
export const preferPresenceServiceProxy = process.env.PREFER_PRESENCE_SERVICE_PROXY !== "false"
export const voiceSignalingServiceUrl = process.env.VOICE_SIGNALING_SERVICE_URL ?? "http://localhost:4003"
export const preferVoiceSignalingProxy = process.env.PREFER_VOICE_SIGNALING_PROXY !== "false"
export const realtimeGatewayUrl = process.env.REALTIME_GATEWAY_URL ?? "http://localhost:4001"
export const preferRealtimeGatewayFanout = process.env.PREFER_REALTIME_GATEWAY_FANOUT !== "false"
export const realtimeGatewayInternalApiKey = process.env.REALTIME_GATEWAY_INTERNAL_API_KEY ?? ""
export const accessTokenTtlSeconds = Math.max(60, Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 60 * 15))
export const refreshTokenTtlSeconds = Math.max(300, Number(process.env.REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30))
export const idempotencyKeyTtlSeconds = Math.max(
  60,
  Number(process.env.IDEMPOTENCY_KEY_TTL_SECONDS ?? 60 * 60 * 24)
)
export const adminApiKey = process.env.ADMIN_API_KEY ?? ""

const featureFlagDefinitions: FeatureFlagDefinition[] = [
  {
    key: "screen_share",
    defaultValue: false,
    description: "Enable screen-share controls.",
    aliases: ["ENABLE_SCREEN_SHARE"]
  },
  {
    key: "message_idempotency",
    defaultValue: true,
    description: "Enable idempotency key support for message send routes.",
    aliases: ["ENABLE_MESSAGE_IDEMPOTENCY"]
  },
  {
    key: "structured_logging",
    defaultValue: true,
    description: "Emit structured JSON request logs.",
    aliases: ["ENABLE_STRUCTURED_LOGGING"]
  },
  {
    key: "metrics_endpoint",
    defaultValue: true,
    description: "Expose Prometheus metrics endpoint.",
    aliases: ["ENABLE_METRICS_ENDPOINT"]
  },
  {
    key: "trace_id_error_responses",
    defaultValue: true,
    description: "Include trace IDs in JSON error payloads.",
    aliases: ["ENABLE_TRACE_ID_ERROR_RESPONSES"]
  }
]

const featureFlags = new FeatureFlagManager(featureFlagDefinitions).snapshot()
export const enableScreenShare = featureFlags.screen_share
export const enableMessageIdempotency = featureFlags.message_idempotency
export const enableStructuredLogging = featureFlags.structured_logging
export const enableMetricsEndpoint = featureFlags.metrics_endpoint
export const enableTraceIdErrorResponses = featureFlags.trace_id_error_responses
