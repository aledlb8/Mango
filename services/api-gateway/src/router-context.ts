import type { AppStore } from "./data/store"
import type { RealtimeHub } from "./realtime/hub"

export type RouteContext = {
  service: string
  corsOrigin: string
  store: AppStore
  realtimeHub: RealtimeHub
}
