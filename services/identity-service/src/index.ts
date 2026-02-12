import { corsOrigin, port, service } from "./config"
import { createStore } from "./data/store-factory"
import { routeRequest } from "./router"

const { store, mode } = await createStore()

const context = {
  service,
  corsOrigin,
  store
}

Bun.serve({
  port,
  fetch(request) {
    return routeRequest(request, context)
  }
})

console.log(`${service} listening on http://localhost:${port} (store: ${mode})`)
