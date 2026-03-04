export type FeatureFlagDefinition = {
  key: string
  defaultValue: boolean
  description: string
  envVar?: string
  aliases?: string[]
}

export type FeatureFlagSnapshot = Record<string, boolean>

function readBoolean(value: string | undefined): boolean | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false
  }

  return null
}

export class FeatureFlagManager {
  private readonly flags: FeatureFlagSnapshot

  constructor(definitions: FeatureFlagDefinition[], env: Record<string, string | undefined> = process.env) {
    this.flags = {}

    for (const definition of definitions) {
      const envCandidates = [
        definition.envVar,
        ...toFeatureEnvNames(definition.key),
        ...(definition.aliases ?? [])
      ].filter((candidate): candidate is string => Boolean(candidate))

      let resolved: boolean | null = null
      for (const candidate of envCandidates) {
        const parsed = readBoolean(env[candidate])
        if (parsed !== null) {
          resolved = parsed
          break
        }
      }

      this.flags[definition.key] = resolved ?? definition.defaultValue
    }
  }

  isEnabled(flagKey: string): boolean {
    return this.flags[flagKey] === true
  }

  snapshot(): FeatureFlagSnapshot {
    return {
      ...this.flags
    }
  }
}

function toFeatureEnvNames(flagKey: string): string[] {
  const snake = flagKey
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()

  if (!snake) {
    return []
  }

  return [`FEATURE_${snake}`, snake]
}
