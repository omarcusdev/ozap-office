import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type Tool,
  type ContentBlock,
} from "@aws-sdk/client-bedrock-runtime"
import { config } from "../config.js"

const client = new BedrockRuntimeClient({ region: config.awsRegion })

const DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-6"

type ConverseInput = {
  messages: Message[]
  systemPrompt: string
  tools: Tool[]
  modelId?: string
}

type ConverseResult = {
  output: ContentBlock[]
  stopReason: string
  usage: { inputTokens: number; outputTokens: number }
}

export const converse = async ({
  messages,
  systemPrompt,
  tools,
  modelId = DEFAULT_MODEL,
}: ConverseInput): Promise<ConverseResult> => {
  const command = new ConverseCommand({
    modelId,
    system: [{ text: systemPrompt }],
    messages,
    toolConfig: tools.length > 0 ? { tools } : undefined,
  })

  const response = await client.send(command)

  return {
    output: response.output?.message?.content ?? [],
    stopReason: response.stopReason ?? "end_turn",
    usage: {
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
    },
  }
}
