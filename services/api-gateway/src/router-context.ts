import type { AppStore } from "./data/store"
import type { RealtimePublisher } from "./realtime/publisher"

export type RouteContext = {
  service: string
  corsOrigin: string
  store: AppStore
  realtimeHub: RealtimePublisher
}
