import type { AppStore } from "./data/store"

export type RouteContext = {
  service: string
  corsOrigin: string
  store: AppStore
}
