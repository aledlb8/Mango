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
  preferMessagingServiceProxy,
  preferVoiceSignalingProxy,
  presenceServiceUrl,
  voiceSignalingServiceUrl,
  service
} from "./config"
import { createStore } from "./data/store-factory"
import { routeRequest } from "./router"
import { RealtimeHub, type SocketData } from "./realtime/hub"
import { createWebSocketHandlers, tryUpgradeToWebSocket } from "./realtime/websocket"

const { store, mode } = await createStore()
const realtimeHub = new RealtimeHub()

const context = {
  service,
  corsOrigin,
  store,
  realtimeHub
}

Bun.serve<SocketData>({
  port,
  websocket: createWebSocketHandlers(context),
  async fetch(request, server) {
    const { pathname } = new URL(request.url)

    if (pathname === "/v1/ws") {
      const upgraded = await tryUpgradeToWebSocket(request, server, context)
      if (upgraded) {
        return upgraded
      }
      return
    }

    return routeRequest(request, context)
  }
})

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
console.log(`${service} screen-share feature flag: ${enableScreenShare ? "enabled" : "disabled"}`)
