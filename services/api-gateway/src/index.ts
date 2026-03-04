import {
  communityServiceUrl,
  corsOrigin,
  enableMetricsEndpoint,
  enableScreenShare,
  enableStructuredLogging,
  enableTraceIdErrorResponses,
  identityServiceUrl,
  mediaServiceUrl,
  messagingServiceUrl,
  port,
  preferCommunityServiceProxy,
  preferIdentityServiceProxy,
  preferMediaServiceProxy,
  preferPresenceServiceProxy,
  preferRealtimeGatewayFanout,
  preferMessagingServiceProxy,
  preferVoiceSignalingProxy,
  presenceServiceUrl,
  realtimeGatewayInternalApiKey,
  realtimeGatewayUrl,
  voiceSignalingServiceUrl,
  service
} from "./config"
import { createStore } from "./data/store-factory"
import { createIdempotencyStore } from "./idempotency/store"
import { IdempotencyManager } from "./idempotency/manager"
import { error } from "./http/response"
import { withTraceResponse } from "./http/trace-response"
import { logRequest } from "./observability/logger"
import { ApiGatewayMetrics } from "./observability/metrics"
import { readOrCreateTraceId } from "./observability/trace"
import { routeRequest } from "./router"
import { RealtimeHub, type SocketData } from "./realtime/hub"
import { HttpRealtimePublisher } from "./realtime/publisher"
import { createWebSocketHandlers, tryUpgradeToWebSocket } from "./realtime/websocket"

function reasonMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message
  }
  return "Unexpected error."
}

function pathForMetrics(pathname: string): string {
  return pathname
    .replace(/\/(usr|srv|chn|msg|thr|rol|frq|apl|rpt|att|bot)_[^/]+/g, "/:id")
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,36}/gi, "/:uuid")
}

const metrics = new ApiGatewayMetrics()
const { store, mode } = await createStore()
const idempotencyStore = await createIdempotencyStore()
const idempotencyManager = new IdempotencyManager(idempotencyStore)

const localRealtimeHub = preferRealtimeGatewayFanout ? null : new RealtimeHub()
const realtimeHub =
  localRealtimeHub ??
  new HttpRealtimePublisher(realtimeGatewayUrl, realtimeGatewayInternalApiKey)

const baseContext = {
  service,
  corsOrigin,
  store,
  realtimeHub,
  metrics,
  idempotencyManager
}

async function handleHttpRequest(request: Request): Promise<Response> {
  const traceId = readOrCreateTraceId(request)
  const startedAt = performance.now()
  const url = new URL(request.url)
  let status = 500
  let level: "info" | "error" = "info"
  let message: string | undefined

  try {
    const requestContext = {
      ...baseContext,
      traceId
    }

    let response: Response
    if (enableMetricsEndpoint && request.method === "GET" && url.pathname === "/metrics") {
      response = new Response(metrics.renderPrometheus(), {
        status: 200,
        headers: {
          "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": corsOrigin
        }
      })
    } else {
      response = await routeRequest(request, requestContext)
    }

    response = await withTraceResponse(response, traceId, enableTraceIdErrorResponses)
    status = response.status
    return response
  } catch (reason) {
    level = "error"
    message = reasonMessage(reason)
    const fallback = error(
      corsOrigin,
      500,
      "Internal server error.",
      enableTraceIdErrorResponses ? traceId : undefined
    )
    const tracedFallback = await withTraceResponse(
      fallback,
      traceId,
      enableTraceIdErrorResponses
    )
    status = tracedFallback.status
    return tracedFallback
  } finally {
    const durationMs = Number((performance.now() - startedAt).toFixed(2))
    const metricPath = pathForMetrics(url.pathname)
    metrics.recordRequest(request.method, metricPath, status, durationMs)

    if (enableStructuredLogging) {
      logRequest({
        level,
        service,
        traceId,
        method: request.method,
        path: url.pathname,
        status,
        durationMs,
        message
      })
    }
  }
}

if (localRealtimeHub) {
  const websocketContext = {
    ...baseContext,
    realtimeHub: localRealtimeHub
  }

  Bun.serve<SocketData>({
    port,
    websocket: createWebSocketHandlers(websocketContext),
    async fetch(request, server) {
      const url = new URL(request.url)
      if (url.pathname === "/v1/ws") {
        const traceId = readOrCreateTraceId(request)
        const context = {
          ...websocketContext,
          traceId
        }

        const upgraded = await tryUpgradeToWebSocket(request, server, context)
        if (upgraded) {
          return await withTraceResponse(
            upgraded,
            traceId,
            enableTraceIdErrorResponses
          )
        }

        metrics.recordRequest("GET", pathForMetrics(url.pathname), 101, 0)
        return
      }

      return await handleHttpRequest(request)
    }
  })
} else {
  Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/v1/ws") {
        const websocketBase = realtimeGatewayUrl
          .replace(/^http:\/\//, "ws://")
          .replace(/^https:\/\//, "wss://")
          .replace(/\/+$/, "")

        const response = Response.json(
          {
            error: "WebSocket endpoint moved to realtime-gateway.",
            websocketUrl: `${websocketBase}/v1/ws${url.search}`
          },
          {
            status: 426,
            headers: {
              "Access-Control-Allow-Origin": corsOrigin
            }
          }
        )

        return await withTraceResponse(
          response,
          readOrCreateTraceId(request),
          enableTraceIdErrorResponses
        )
      }

      return await handleHttpRequest(request)
    }
  })
}

console.log(`${service} listening on http://localhost:${port} (store: ${mode})`)
if (preferIdentityServiceProxy) {
  console.log(`${service} identity proxy enabled -> ${identityServiceUrl}`)
}
if (preferCommunityServiceProxy) {
  console.log(`${service} community proxy enabled -> ${communityServiceUrl}`)
}
if (preferMessagingServiceProxy) {
  console.log(`${service} messaging proxy enabled -> ${messagingServiceUrl}`)
}
if (preferMediaServiceProxy) {
  console.log(`${service} media proxy enabled -> ${mediaServiceUrl}`)
}
if (preferPresenceServiceProxy) {
  console.log(`${service} presence proxy enabled -> ${presenceServiceUrl}`)
}
if (preferVoiceSignalingProxy) {
  console.log(`${service} voice-signaling proxy enabled -> ${voiceSignalingServiceUrl}`)
}
console.log(
  `${service} realtime fanout owner: ${preferRealtimeGatewayFanout ? "realtime-gateway" : "api-gateway (fallback mode)"}`
)
if (preferRealtimeGatewayFanout) {
  console.log(`${service} realtime event publish target -> ${realtimeGatewayUrl}`)
}
console.log(`${service} screen-share feature flag: ${enableScreenShare ? "enabled" : "disabled"}`)
