import type { AppStore } from "./data/store"
import type { IdempotencyManager } from "./idempotency/manager"
import type { ApiGatewayMetrics } from "./observability/metrics"
import type { RealtimePublisher } from "./realtime/publisher"

export type RouteContext = {
  service: string
  corsOrigin: string
  traceId?: string
  store: AppStore
  metrics?: ApiGatewayMetrics
  idempotencyManager?: IdempotencyManager
  realtimeHub: RealtimePublisher
}
