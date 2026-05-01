import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type Tool,
  type ContentBlock,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime"
import { config } from "../config.js"
import type { InferenceConfig } from "@ozap-office/shared"

const client = new BedrockRuntimeClient({ region: config.awsRegion })

const DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-6"
const MODEL_PREFIX = "us.anthropic."
const VALID_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-opus-4-7",
])
const DEFAULT_MAX_TOKENS = 4096
const RETRYABLE_ERRORS = [
  "ThrottlingException",
  "ServiceUnavailableException",
  "ModelStreamErrorException",
  "ModelTimeoutException",
  "InternalServerException",
]
const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

type ConverseInput = {
  messages: Message[]
  systemPrompt: string
  tools: Tool[]
  inferenceConfig?: InferenceConfig | null
}

type ConverseResult = {
  output: ContentBlock[]
  stopReason: string
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheWriteInputTokens: number
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isRetryable = (error: unknown): boolean => {
  const name = (error as { name?: string })?.name
  return name !== undefined && RETRYABLE_ERRORS.includes(name)
}

const computeBackoff = (attempt: number): number => {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt)
  const jitter = Math.random() * BASE_DELAY_MS
  return exponential + jitter
}

const resolveModelId = (model: string | undefined): string => {
  if (model && VALID_MODELS.has(model)) return `${MODEL_PREFIX}${model}`
  return DEFAULT_MODEL
}

export const converse = async ({
  messages,
  systemPrompt,
  tools,
  inferenceConfig,
}: ConverseInput): Promise<ConverseResult> => {
  const modelId = resolveModelId(inferenceConfig?.model)
  const maxTokens = inferenceConfig?.maxTokens ?? DEFAULT_MAX_TOKENS
  const temperature = inferenceConfig?.temperature

  const additionalModelRequestFields = inferenceConfig?.thinking?.enabled
    ? {
        thinking: {
          type: "enabled",
          budget_tokens: inferenceConfig.thinking.budgetTokens,
        },
      }
    : undefined

  const cachedTools: Tool[] =
    tools.length > 0 ? [...tools, { cachePoint: { type: "default" } } as Tool] : []

  const command = new ConverseCommand({
    modelId,
    system: [
      { text: systemPrompt },
      { cachePoint: { type: "default" } } as SystemContentBlock,
    ],
    messages,
    toolConfig: cachedTools.length > 0 ? { tools: cachedTools } : undefined,
    inferenceConfig: {
      maxTokens,
      ...(temperature !== undefined && { temperature }),
    },
    ...(additionalModelRequestFields && { additionalModelRequestFields }),
  })

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.send(command)
      return {
        output: response.output?.message?.content ?? [],
        stopReason: response.stopReason ?? "end_turn",
        usage: {
          inputTokens: response.usage?.inputTokens ?? 0,
          outputTokens: response.usage?.outputTokens ?? 0,
          cacheReadInputTokens: response.usage?.cacheReadInputTokens ?? 0,
          cacheWriteInputTokens: response.usage?.cacheWriteInputTokens ?? 0,
        },
      }
    } catch (error) {
      if (attempt === MAX_ATTEMPTS - 1 || !isRetryable(error)) throw error
      console.warn(
        `[bedrock] retry ${attempt + 1}/${MAX_ATTEMPTS} after ${
          (error as { name?: string })?.name ?? "error"
        }`
      )
      await sleep(computeBackoff(attempt))
    }
  }
  throw new Error("Unreachable")
}
