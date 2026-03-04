import { createMediaServiceFetch } from "./app"
import { loadConfig } from "./config"

const config = loadConfig()

Bun.serve({
  port: config.port,
  fetch: createMediaServiceFetch(config)
})

console.log(`${config.service} listening on http://localhost:${config.port}`)
