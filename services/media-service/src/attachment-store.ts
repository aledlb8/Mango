import type { Attachment } from "@mango/contracts"
import { createHash } from "node:crypto"
import type { AttachmentMetadata, NormalizedAttachmentInput, StoredAttachment } from "./domain"

export class AttachmentStore {
  private readonly recordsById = new Map<string, StoredAttachment>()

  constructor(private readonly publicBaseUrl: string) {}

  create(input: NormalizedAttachmentInput, tokenBound: boolean): Attachment {
    const id = `att_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
    const createdAt = new Date().toISOString()
    const url = this.buildUrl(id, input.fileName)

    const attachment: Attachment = {
      id,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      url,
      uploadedBy: input.uploadedBy,
      createdAt
    }

    const metadata: AttachmentMetadata = {
      attachmentId: id,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      category: input.mediaRule.category,
      extension: input.extension,
      previewable: input.mediaRule.previewable,
      checksumSha256: createHash("sha256")
        .update(`${input.fileName}|${input.contentType}|${input.sizeBytes}|${createdAt}`)
        .digest("hex"),
      tokenBound,
      validatedAt: createdAt
    }

    this.recordsById.set(id, {
      attachment,
      metadata
    })

    return attachment
  }

  getAttachment(attachmentId: string): Attachment | null {
    return this.recordsById.get(attachmentId)?.attachment ?? null
  }

  getMetadata(attachmentId: string): AttachmentMetadata | null {
    return this.recordsById.get(attachmentId)?.metadata ?? null
  }

  private buildUrl(id: string, fileName: string): string {
    const path = `/uploads/${id}/${encodeURIComponent(fileName)}`
    const trimmedBase = this.publicBaseUrl.replace(/\/+$/, "")
    if (!trimmedBase) {
      return path
    }

    return `${trimmedBase}${path}`
  }
}
