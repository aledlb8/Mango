import type { Attachment, CreateAttachmentRequest } from "@mango/contracts"

export type MediaCategory = "image" | "video" | "audio" | "document"

export type MediaRule = {
  category: MediaCategory
  maxBytes: number
  allowedExtensions: string[]
  previewable: boolean
}

export const mediaRules: Record<string, MediaRule> = {
  "image/png": {
    category: "image",
    maxBytes: 10 * 1024 * 1024,
    allowedExtensions: ["png"],
    previewable: true
  },
  "image/jpeg": {
    category: "image",
    maxBytes: 10 * 1024 * 1024,
    allowedExtensions: ["jpg", "jpeg"],
    previewable: true
  },
  "image/gif": {
    category: "image",
    maxBytes: 12 * 1024 * 1024,
    allowedExtensions: ["gif"],
    previewable: true
  },
  "image/webp": {
    category: "image",
    maxBytes: 10 * 1024 * 1024,
    allowedExtensions: ["webp"],
    previewable: true
  },
  "video/mp4": {
    category: "video",
    maxBytes: 50 * 1024 * 1024,
    allowedExtensions: ["mp4"],
    previewable: true
  },
  "video/webm": {
    category: "video",
    maxBytes: 50 * 1024 * 1024,
    allowedExtensions: ["webm"],
    previewable: true
  },
  "audio/mpeg": {
    category: "audio",
    maxBytes: 20 * 1024 * 1024,
    allowedExtensions: ["mp3"],
    previewable: true
  },
  "audio/ogg": {
    category: "audio",
    maxBytes: 20 * 1024 * 1024,
    allowedExtensions: ["ogg"],
    previewable: true
  },
  "audio/wav": {
    category: "audio",
    maxBytes: 20 * 1024 * 1024,
    allowedExtensions: ["wav"],
    previewable: true
  },
  "application/pdf": {
    category: "document",
    maxBytes: 15 * 1024 * 1024,
    allowedExtensions: ["pdf"],
    previewable: true
  },
  "text/plain": {
    category: "document",
    maxBytes: 5 * 1024 * 1024,
    allowedExtensions: ["txt", "md", "log"],
    previewable: true
  }
}

export type AttachmentCreateRequest = CreateAttachmentRequest & {
  uploadToken?: string
  uploadedBy?: string
}

export type CreateUploadTokenRequest = CreateAttachmentRequest & {
  uploadedBy?: string
  expiresInSeconds?: number
}

export type NormalizedAttachmentInput = {
  fileName: string
  contentType: string
  sizeBytes: number
  uploadedBy: string
  extension: string | null
  mediaRule: MediaRule
}

export type UploadTokenRecord = {
  token: string
  fileName: string
  contentType: string
  sizeBytes: number
  uploadedBy: string
  expiresAt: string
}

export type UploadTokenResponse = {
  token: string
  expiresAt: string
  constraints: {
    fileName: string
    contentType: string
    sizeBytes: number
  }
  uploadUrl: string
}

export type AttachmentMetadata = {
  attachmentId: string
  fileName: string
  contentType: string
  sizeBytes: number
  category: MediaCategory
  extension: string | null
  previewable: boolean
  checksumSha256: string
  tokenBound: boolean
  validatedAt: string
}

export type StoredAttachment = {
  attachment: Attachment
  metadata: AttachmentMetadata
}
