import { describe, expect, it } from "bun:test"
import { FeatureFlagManager, type FeatureFlagDefinition } from "./feature-flags"

const definitions: FeatureFlagDefinition[] = [
  {
    key: "screen_share",
    defaultValue: false,
    description: "Enable screen sharing.",
    aliases: ["ENABLE_SCREEN_SHARE"]
  },
  {
    key: "message_idempotency",
    defaultValue: true,
    description: "Enable message idempotency."
  }
]

describe("FeatureFlagManager", () => {
  it("uses defaults when env vars are missing", () => {
    const manager = new FeatureFlagManager(definitions, {})
    expect(manager.isEnabled("screen_share")).toBe(false)
    expect(manager.isEnabled("message_idempotency")).toBe(true)
  })

  it("supports explicit aliases and FEATURE_* variables", () => {
    const manager = new FeatureFlagManager(definitions, {
      ENABLE_SCREEN_SHARE: "true",
      FEATURE_MESSAGE_IDEMPOTENCY: "false"
    })

    expect(manager.isEnabled("screen_share")).toBe(true)
    expect(manager.isEnabled("message_idempotency")).toBe(false)
  })
})
