import { describe, expect, it } from "bun:test"
import { UploadTokenStore } from "./token-store"
import type { NormalizedAttachmentInput } from "./domain"

const baseInput: NormalizedAttachmentInput = {
  fileName: "voice.ogg",
  contentType: "audio/ogg",
  sizeBytes: 4096,
  uploadedBy: "usr_1",
  extension: "ogg",
  mediaRule: {
    category: "audio",
    maxBytes: 20 * 1024 * 1024,
    allowedExtensions: ["ogg"],
    previewable: true
  }
}

describe("UploadTokenStore", () => {
  it("issues and consumes one-time upload tokens", () => {
    const store = new UploadTokenStore(300)
    const issued = store.issue(baseInput, 120)

    expect(issued.token).toMatch(/^up_/)
    expect(issued.constraints.fileName).toBe(baseInput.fileName)

    const consumeError = store.consume(issued.token, baseInput)
    expect(consumeError).toBeNull()

    const secondConsumeError = store.consume(issued.token, baseInput)
    expect(secondConsumeError).toContain("invalid or expired")
  })

  it("rejects token constraints mismatch", () => {
    const store = new UploadTokenStore(300)
    const issued = store.issue(baseInput, 120)

    const consumeError = store.consume(issued.token, {
      ...baseInput,
      sizeBytes: 2048
    })

    expect(consumeError).toContain("sizeBytes does not match")
  })
})
