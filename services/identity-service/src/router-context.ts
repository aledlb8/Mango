import type { IdentityStore } from "./data/store"

export type IdentityRouteContext = {
  service: string
  corsOrigin: string
  store: IdentityStore
}
