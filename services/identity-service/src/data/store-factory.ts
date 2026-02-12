import { allowMemoryFallback, databaseUrl } from "../config"
import { MemoryStore } from "./memory-store"
import { PostgresStore } from "./postgres-store"
import type { IdentityStore, StoreKind } from "./store"

export type StoreInitResult = {
  store: IdentityStore
  mode: StoreKind
}

export async function createStore(): Promise<StoreInitResult> {
  try {
    const store = await PostgresStore.connect(databaseUrl)
    return {
      store,
      mode: "postgres"
    }
  } catch (error) {
    if (!allowMemoryFallback) {
      throw error
    }

    console.warn("[identity-service] postgres unavailable, falling back to in-memory store.")
    if (error instanceof Error) {
      console.warn(`[identity-service] postgres error: ${error.message}`)
    }

    return {
      store: new MemoryStore(),
      mode: "memory"
    }
  }
}
