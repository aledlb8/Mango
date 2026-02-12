let sequence = 0

export function createId(prefix: string): string {
  sequence += 1
  const random = crypto.randomUUID().slice(0, 8)
  return `${prefix}_${Date.now().toString(36)}_${sequence.toString(36)}${random}`
}
