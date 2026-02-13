import type { Attachment } from "@mango/contracts"

export function normalizeAttachments(attachments: Attachment[] | undefined, userId: string): Attachment[] {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return []
  }

  const normalized: Attachment[] = []
  for (const attachment of attachments.slice(0, 10)) {
    const id = attachment.id?.trim()
    const fileName = attachment.fileName?.trim()
    const contentType = attachment.contentType?.trim()
    const url = attachment.url?.trim()

    if (!id || !fileName || !contentType || !url) {
      continue
    }

    const sizeBytes = Number(attachment.sizeBytes)
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 25 * 1024 * 1024) {
      continue
    }

    normalized.push({
      id,
      fileName,
      contentType,
      sizeBytes,
      url,
      uploadedBy: userId,
      createdAt: attachment.createdAt || new Date().toISOString()
    })
  }

  return normalized
}
