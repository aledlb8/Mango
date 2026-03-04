import { mediaRules, type AttachmentCreateRequest, type NormalizedAttachmentInput } from "./domain"

const maxFileNameLength = 255

function readExtension(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf(".")
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return null
  }

  return fileName.slice(lastDot + 1).toLowerCase()
}

function hasPathSegment(fileName: string): boolean {
  return fileName.includes("/") || fileName.includes("\\")
}

export function normalizeAttachmentInput(
  raw: AttachmentCreateRequest | null,
  maxUploadBytes: number
): { value: NormalizedAttachmentInput | null; error: string | null } {
  if (!raw) {
    return {
      value: null,
      error: "Invalid attachment payload."
    }
  }

  const fileName = raw.fileName?.trim()
  if (!fileName) {
    return {
      value: null,
      error: "fileName is required."
    }
  }

  if (fileName.length > maxFileNameLength) {
    return {
      value: null,
      error: `fileName exceeds ${maxFileNameLength} characters.`
    }
  }

  if (hasPathSegment(fileName)) {
    return {
      value: null,
      error: "fileName must not include path segments."
    }
  }

  const contentType = raw.contentType?.trim().toLowerCase()
  if (!contentType) {
    return {
      value: null,
      error: "contentType is required."
    }
  }

  const mediaRule = mediaRules[contentType]
  if (!mediaRule) {
    return {
      value: null,
      error: "Unsupported contentType."
    }
  }

  const sizeBytes = Number(raw.sizeBytes)
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return {
      value: null,
      error: "sizeBytes must be a positive number."
    }
  }

  const perTypeLimit = Math.min(mediaRule.maxBytes, maxUploadBytes)
  if (sizeBytes > perTypeLimit) {
    return {
      value: null,
      error: `sizeBytes exceeds allowed limit (${perTypeLimit} bytes) for ${contentType}.`
    }
  }

  const extension = readExtension(fileName)
  if (extension && !mediaRule.allowedExtensions.includes(extension)) {
    return {
      value: null,
      error: `fileName extension .${extension} is not allowed for ${contentType}.`
    }
  }

  const uploadedBy = raw.uploadedBy?.trim() || "unknown"
  return {
    value: {
      fileName,
      contentType,
      sizeBytes,
      uploadedBy,
      extension,
      mediaRule
    },
    error: null
  }
}
