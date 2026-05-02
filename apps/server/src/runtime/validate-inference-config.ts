import type { InferenceConfig } from "@ozap-office/shared"

const VALID_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-opus-4-7",
])

type Validation = { valid: true } | { valid: false; message: string }

export const validateInferenceConfig = (
  config: InferenceConfig | null
): Validation => {
  if (config === null) return { valid: true }

  if (config.model && !VALID_MODELS.has(config.model)) {
    return { valid: false, message: `Invalid model: ${config.model}` }
  }

  if (config.thinking?.enabled) {
    const b = config.thinking.budgetTokens
    if (typeof b !== "number" || b < 1024 || b > 16384) {
      return { valid: false, message: "thinking.budgetTokens must be 1024-16384" }
    }
  }

  if (config.maxTokens !== undefined) {
    if (
      typeof config.maxTokens !== "number" ||
      config.maxTokens < 256 ||
      config.maxTokens > 8192
    ) {
      return { valid: false, message: "maxTokens must be 256-8192" }
    }
  }

  if (config.temperature !== undefined) {
    if (
      typeof config.temperature !== "number" ||
      config.temperature < 0 ||
      config.temperature > 1
    ) {
      return { valid: false, message: "temperature must be 0.0-1.0" }
    }
  }

  if (
    config.thinking?.enabled &&
    config.maxTokens !== undefined &&
    config.maxTokens <= config.thinking.budgetTokens
  ) {
    return {
      valid: false,
      message: `maxTokens (${config.maxTokens}) must be greater than thinking.budgetTokens (${config.thinking.budgetTokens}). Bump maxTokens or lower the thinking budget.`,
    }
  }

  return { valid: true }
}
