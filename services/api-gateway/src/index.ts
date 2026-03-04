import {
  communityServiceUrl,
  corsOrigin,
  enableScreenShare,
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
import { routeRequest } from "./router"
import { RealtimeHub, type SocketData } from "./realtime/hub"
import { HttpRealtimePublisher } from "./realtime/publisher"
import { createWebSocketHandlers, tryUpgradeToWebSocket } from "./realtime/websocket"

const { store, mode } = await createStore()
const localRealtimeHub = preferRealtimeGatewayFanout ? null : new RealtimeHub()
const realtimeHub =
  localRealtimeHub ??
  new HttpRealtimePublisher(realtimeGatewayUrl, realtimeGatewayInternalApiKey)

const context = {
  service,
  corsOrigin,
  store,
  realtimeHub
}

if (localRealtimeHub) {
  const websocketContext = {
    ...context,
    realtimeHub: localRealtimeHub
  }

  Bun.serve<SocketData>({
    port,
    websocket: createWebSocketHandlers(websocketContext),
    async fetch(request, server) {
      const { pathname } = new URL(request.url)

      if (pathname === "/v1/ws") {
        const upgraded = await tryUpgradeToWebSocket(request, server, websocketContext)
        if (upgraded) {
          return upgraded
        }
        return
      }

      return routeRequest(request, context)
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

        return Response.json(
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
      }

      return routeRequest(request, context)
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
