import { describe, expect, it } from "bun:test"
import { isExpiredSubscriptionError, isRetryablePushError } from "./push"

describe("push error classification", () => {
  it("treats 404 and 410 as expired subscriptions", () => {
    expect(isExpiredSubscriptionError({ statusCode: 404 })).toBe(true)
    expect(isExpiredSubscriptionError({ statusCode: 410 })).toBe(true)
    expect(isExpiredSubscriptionError({ statusCode: 429 })).toBe(false)
  })

  it("retries transient push errors", () => {
    expect(isRetryablePushError({ statusCode: 429 })).toBe(true)
    expect(isRetryablePushError({ statusCode: 503 })).toBe(true)
    expect(isRetryablePushError({ statusCode: 400 })).toBe(false)
  })
})
