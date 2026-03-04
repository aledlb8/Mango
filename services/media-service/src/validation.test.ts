import { describe, expect, it } from "bun:test"
import { normalizeAttachmentInput } from "./validation"

describe("normalizeAttachmentInput", () => {
  it("accepts valid attachments", () => {
    const { value, error } = normalizeAttachmentInput(
      {
        fileName: "avatar.png",
        contentType: "image/png",
        sizeBytes: 1024,
        uploadedBy: "usr_123"
      },
      25 * 1024 * 1024
    )

    expect(error).toBeNull()
    expect(value).not.toBeNull()
    expect(value?.extension).toBe("png")
    expect(value?.mediaRule.category).toBe("image")
  })

  it("rejects unsupported content types", () => {
    const { value, error } = normalizeAttachmentInput(
      {
        fileName: "shell.exe",
        contentType: "application/x-msdownload",
        sizeBytes: 2048
      },
      25 * 1024 * 1024
    )

    expect(value).toBeNull()
    expect(error).toContain("Unsupported contentType")
  })

  it("rejects extension mismatch", () => {
    const { value, error } = normalizeAttachmentInput(
      {
        fileName: "doc.pdf",
        contentType: "image/png",
        sizeBytes: 1024
      },
      25 * 1024 * 1024
    )

    expect(value).toBeNull()
    expect(error).toContain("not allowed")
  })

  it("rejects files over per-type limit", () => {
    const { value, error } = normalizeAttachmentInput(
      {
        fileName: "wallpaper.webp",
        contentType: "image/webp",
        sizeBytes: 20 * 1024 * 1024
      },
      25 * 1024 * 1024
    )

    expect(value).toBeNull()
    expect(error).toContain("exceeds allowed limit")
  })
})
