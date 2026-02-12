import path from "node:path"
import { allowMemoryFallback, databaseUrl, storeMode } from "../config"
import { MemoryStore } from "./memory-store"
import { PostgresStore } from "./postgres-store"
import type { StoreInitResult } from "./store"

const migrationsDir = path.resolve(import.meta.dir, "../../migrations")

export async function createStore(): Promise<StoreInitResult> {
  if (storeMode === "memory") {
    return {
      store: new MemoryStore(),
      mode: "memory"
    }
  }

  try {
    const store = await PostgresStore.connect(databaseUrl, migrationsDir)
    return {
      store,
      mode: "postgres"
    }
  } catch (error) {
    if (!allowMemoryFallback) {
      throw error
    }

    console.warn("[api-gateway] postgres unavailable, falling back to in-memory store.")
    if (error instanceof Error) {
      console.warn(`[api-gateway] postgres error: ${error.message}`)
    }

    return {
      store: new MemoryStore(),
      mode: "memory"
    }
  }
}
