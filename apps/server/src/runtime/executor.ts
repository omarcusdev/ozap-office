import { nanoid } from "nanoid"
import type { ContentBlock, Message } from "@aws-sdk/client-bedrock-runtime"
import { db } from "../db/client.js"
import { agents, taskRuns, events, meetingMessages } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { converse } from "./bedrock.js"
import { executeTool } from "./tool-executor.js"
import { eventBus } from "../events/event-bus.js"
import type { AgentEventType, ToolDefinition } from "@ozap-office/shared"

const updateAgentStatus = async (agentId: string, status: string) => {
  await db.update(agents).set({ status, updatedAt: new Date() }).where(eq(agents.id, agentId))
  eventBus.emit("agentStatus", { agentId, status: status as any })
}

const emitEvent = async (
  agentId: string,
  taskRunId: string,
  type: AgentEventType,
  content: string,
  metadata: Record<string, unknown> = {}
) => {
  const [event] = await db
    .insert(events)
    .values({ agentId, taskRunId, type, content, metadata, timestamp: new Date() })
    .returning()
  eventBus.emit("agentEvent", event as any)
  return event
}

const buildBedrockTools = (tools: ToolDefinition[]) =>
  tools.map((t) => ({
    toolSpec: {
      name: t.name,
      description: t.description,
      inputSchema: { json: t.inputSchema },
    },
  })) as any[]

const extractToolUseBlocks = (content: ContentBlock[]) =>
  content.filter((block): block is ContentBlock & { toolUse: NonNullable<ContentBlock["toolUse"]> } =>
    block.toolUse !== undefined
  )

const extractTextContent = (content: ContentBlock[]): string =>
  content
    .filter((block): block is ContentBlock & { text: string } => typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")

export const executeAgent = async (
  agentId: string,
  trigger: string,
  inputContext?: string
) => {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  const [taskRun] = await db
    .insert(taskRuns)
    .values({
      agentId,
      trigger,
      status: "running",
      input: inputContext ? { context: inputContext } : null,
      startedAt: new Date(),
    })
    .returning()

  await updateAgentStatus(agentId, "working")

  const agentTools = agent.tools as ToolDefinition[]
  const bedrockTools = buildBedrockTools(agentTools)

  const messages: Message[] = []
  if (inputContext) {
    messages.push({ role: "user", content: [{ text: inputContext }] })
  } else {
    messages.push({ role: "user", content: [{ text: "Execute your scheduled task." }] })
  }

  try {
    await runAgenticLoop(agent, taskRun.id, messages, agentTools, bedrockTools)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    await db
      .update(taskRuns)
      .set({ status: "failed", output: { error: errorMessage }, completedAt: new Date() })
      .where(eq(taskRuns.id, taskRun.id))
    await emitEvent(agentId, taskRun.id, "error", errorMessage)
  }

  await updateAgentStatus(agentId, "idle")
  return taskRun
}

const runAgenticLoop = async (
  agent: { id: string; systemPrompt: string },
  taskRunId: string,
  messages: Message[],
  agentTools: ToolDefinition[],
  bedrockTools: any[]
): Promise<void> => {
  await updateAgentStatus(agent.id, "thinking")
  await emitEvent(agent.id, taskRunId, "thinking", "Processing...")

  const result = await converse({
    messages,
    systemPrompt: agent.systemPrompt,
    tools: bedrockTools,
  })

  const textContent = extractTextContent(result.output)
  const toolUseBlocks = extractToolUseBlocks(result.output)

  if (textContent) {
    await emitEvent(agent.id, taskRunId, "message", textContent)
  }

  if (result.stopReason === "tool_use" && toolUseBlocks.length > 0) {
    await updateAgentStatus(agent.id, "working")
    messages.push({ role: "assistant", content: result.output })

    const toolResultContents: ContentBlock[] = []
    for (const block of toolUseBlocks) {
      const { toolUse } = block

      await emitEvent(agent.id, taskRunId, "tool_call", toolUse.name!, {
        input: toolUse.input,
      })

      const toolResult = await executeTool(
        agent.id,
        toolUse.name!,
        toolUse.input as Record<string, unknown>,
        agentTools
      )

      await emitEvent(agent.id, taskRunId, "tool_result", toolResult.content, {
        toolName: toolUse.name,
        isError: toolResult.isError,
      })

      toolResultContents.push({
        toolResult: {
          toolUseId: toolUse.toolUseId!,
          content: [{ text: toolResult.content }],
          status: toolResult.isError ? "error" : "success",
        },
      })
    }

    messages.push({ role: "user", content: toolResultContents })
    return runAgenticLoop(agent, taskRunId, messages, agentTools, bedrockTools)
  }

  await db
    .update(taskRuns)
    .set({ status: "completed", output: { result: textContent }, completedAt: new Date() })
    .where(eq(taskRuns.id, taskRunId))
  await emitEvent(agent.id, taskRunId, "completed", textContent || "Task completed")
}

export const executeAgentForMeeting = async (
  agentId: string,
  question: string
): Promise<string> => {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent) return `Agent ${agentId} not found`

  const agentTools = agent.tools as ToolDefinition[]
  const bedrockTools = buildBedrockTools(agentTools)
  const messages: Message[] = [{ role: "user", content: [{ text: question }] }]

  const [taskRun] = await db
    .insert(taskRuns)
    .values({ agentId, trigger: "meeting", status: "running", startedAt: new Date() })
    .returning()

  await updateAgentStatus(agentId, "thinking")
  await runAgenticLoop(agent, taskRun.id, messages, agentTools, bedrockTools)
  await updateAgentStatus(agentId, "idle")

  const [completedRun] = await db.select().from(taskRuns).where(eq(taskRuns.id, taskRun.id))
  const output = completedRun?.output as { result?: string } | null
  return output?.result ?? "No response"
}

export const resumeAfterApproval = async (taskRunId: string, action: "approve" | "reject") => {
  const [run] = await db.select().from(taskRuns).where(eq(taskRuns.id, taskRunId))
  if (!run) return

  const savedMessages = run.input as Message[] | null
  if (!savedMessages) return

  const [agent] = await db.select().from(agents).where(eq(agents.id, run.agentId))
  if (!agent) return

  const approvalResult = action === "approve" ? "Approved by user." : "Rejected by user."
  savedMessages.push({ role: "user", content: [{ text: approvalResult }] })

  await db
    .update(taskRuns)
    .set({ status: "running" })
    .where(eq(taskRuns.id, taskRunId))

  const agentTools = agent.tools as ToolDefinition[]
  const bedrockTools = buildBedrockTools(agentTools)

  await updateAgentStatus(run.agentId, "working")
  await runAgenticLoop(agent, taskRunId, savedMessages, agentTools, bedrockTools)
  await updateAgentStatus(run.agentId, "idle")
}

export const handleMeetingMessage = async (
  meetingId: string,
  userMessage: string
): Promise<string> => {
  const [leader] = await db.select().from(agents).where(eq(agents.name, "Leader"))
  if (!leader) return "Leader agent not found"

  const prompt = `You are in a team meeting. The user said: "${userMessage}". Use your tools to gather information from other agents and provide a comprehensive response.`

  const agentTools = leader.tools as ToolDefinition[]
  const bedrockTools = buildBedrockTools(agentTools)
  const messages: Message[] = [{ role: "user", content: [{ text: prompt }] }]

  const [taskRun] = await db
    .insert(taskRuns)
    .values({ agentId: leader.id, trigger: "meeting", status: "running", startedAt: new Date() })
    .returning()

  await runAgenticLoop(leader, taskRun.id, messages, agentTools, bedrockTools)

  const [completedRun] = await db.select().from(taskRuns).where(eq(taskRuns.id, taskRun.id))
  const output = completedRun?.output as { result?: string } | null
  const responseContent = output?.result ?? "Meeting response generated"

  await db.insert(meetingMessages).values({
    meetingId,
    sender: leader.id,
    content: responseContent,
    timestamp: new Date(),
  })

  eventBus.emit("meetingMessage", {
    id: nanoid(),
    meetingId,
    sender: leader.id,
    content: responseContent,
    metadata: {},
    timestamp: new Date(),
  })

  return responseContent
}
