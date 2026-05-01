import type { ContentBlock, Message } from "@aws-sdk/client-bedrock-runtime"
import { db } from "../db/client.js"
import { agents, taskRuns, events, agentMemories, conversationMessages, conversationSessions, approvals } from "../db/schema.js"
import { eq, and, desc, sql } from "drizzle-orm"
import { converse } from "./bedrock.js"
import { executeTool } from "./tool-executor.js"
import { config } from "../config.js"
import type { DelegationContext } from "../tools/leader.js"
import { classifyToolCall } from "./tool-gateway.js"
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

const buildCoreMemoryBlock = async (agentId: string): Promise<string> => {
  const memories = await db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.type, "core")))

  if (memories.length === 0) return ""

  const entries = memories.map((m) => `- ${m.key}: ${m.content}`).join("\n")
  return `\n\n## Your Current Memory\n${entries}`
}

const computeEaster = (year: number): Date => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const nthWeekday = (year: number, month: number, weekday: number, nth: number): Date => {
  const first = new Date(year, month - 1, 1)
  const firstWeekday = first.getDay()
  const offset = (weekday - firstWeekday + 7) % 7
  const day = 1 + offset + (nth - 1) * 7
  return new Date(year, month - 1, day)
}

const lastWeekday = (year: number, month: number, weekday: number): Date => {
  const last = new Date(year, month, 0)
  const lastDay = last.getDay()
  const offset = (lastDay - weekday + 7) % 7
  return new Date(year, month - 1, last.getDate() - offset)
}

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const getBrHolidays = (year: number): Array<{ date: Date; name: string }> => {
  const easter = computeEaster(year)
  return [
    { date: new Date(year, 0, 1), name: "Ano Novo" },
    { date: addDays(easter, -47), name: "Carnaval" },
    { date: addDays(easter, -2), name: "Sexta-feira Santa" },
    { date: easter, name: "Páscoa" },
    { date: new Date(year, 3, 21), name: "Tiradentes" },
    { date: new Date(year, 4, 1), name: "Dia do Trabalho" },
    { date: nthWeekday(year, 5, 0, 2), name: "Dia das Mães" },
    { date: new Date(year, 5, 12), name: "Dia dos Namorados" },
    { date: addDays(easter, 60), name: "Corpus Christi" },
    { date: nthWeekday(year, 8, 0, 2), name: "Dia dos Pais" },
    { date: new Date(year, 8, 7), name: "Independência do Brasil" },
    { date: new Date(year, 9, 12), name: "Dia das Crianças / Nossa Sra. Aparecida" },
    { date: new Date(year, 10, 2), name: "Finados" },
    { date: new Date(year, 10, 15), name: "Proclamação da República" },
    { date: lastWeekday(year, 11, 5), name: "Black Friday" },
    { date: new Date(year, 11, 25), name: "Natal" },
  ].sort((a, b) => a.date.getTime() - b.date.getTime())
}

const getUpcomingHolidays = (now: Date): string => {
  const brNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const year = brNow.getFullYear()
  const holidays = [...getBrHolidays(year), ...getBrHolidays(year + 1)]

  const upcoming = holidays
    .filter((h) => h.date >= new Date(brNow.getFullYear(), brNow.getMonth(), brNow.getDate()))
    .slice(0, 3)

  if (upcoming.length === 0) return ""
  const formatted = upcoming.map((h) => {
    const d = h.date
    return `${h.name} (${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")})`
  }).join(", ")
  return ` | Próximos feriados/datas: ${formatted}`
}

const buildDateContext = (): string => {
  const now = new Date()
  const dateStr = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Sao_Paulo",
  })
  const timeStr = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
  const isoDate = now.toISOString().split("T")[0]
  const holidays = getUpcomingHolidays(now)
  return `[Data atual: ${dateStr}, ${timeStr} (São Paulo/BRT) | ISO: ${isoDate}${holidays}]`
}

const buildTeamRosterBlock = async (currentAgentId: string): Promise<string> => {
  const allAgents = await db
    .select({ id: agents.id, name: agents.name, role: agents.role, tools: agents.tools, status: agents.status })
    .from(agents)

  const memoryToolNames = ["updateCoreMemory", "deleteCoreMemory", "saveToArchive", "searchArchive"]
  const teammates = allAgents.filter((a) => a.id !== currentAgentId)
  if (teammates.length === 0) return ""

  const entries = teammates
    .map((a) => {
      const toolNames = (a.tools as ToolDefinition[])
        .filter((t) => !memoryToolNames.includes(t.name))
        .map((t) => t.name)
        .join(", ")
      return `- **${a.name}** (ID: \`${a.id}\`) — ${a.role}. Status: ${a.status}. Tools: ${toolNames || "none"}`
    })
    .join("\n")

  return `\n\n## Your Team\nUse the agent IDs below with askAgent, getAgentHistory, or delegateTask:\n${entries}`
}

const getOrCreateSession = async (agentId: string): Promise<string> => {
  const [existing] = await db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.agentId, agentId))
    .orderBy(desc(conversationSessions.updatedAt))
    .limit(1)

  if (existing) return existing.id

  const [session] = await db
    .insert(conversationSessions)
    .values({ agentId })
    .returning()
  return session.id
}

const loadConversationHistory = async (agentId: string): Promise<Message[]> => {
  const [latestSession] = await db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.agentId, agentId))
    .orderBy(desc(conversationSessions.updatedAt))
    .limit(1)

  const conditions = [eq(conversationMessages.agentId, agentId)]
  if (latestSession) {
    conditions.push(eq(conversationMessages.sessionId, latestSession.id))
  }

  const rows = await db
    .select()
    .from(conversationMessages)
    .where(and(...conditions))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(20)

  rows.reverse()

  const sanitized: typeof rows = []
  for (const msg of rows) {
    const last = sanitized[sanitized.length - 1]
    if (last && last.role === msg.role) continue
    sanitized.push(msg)
  }
  if (sanitized.length > 0 && sanitized[0].role !== "user") {
    sanitized.shift()
  }

  return sanitized.map((m) => ({
    role: m.role as "user" | "assistant",
    content: [{ text: m.content }],
  }))
}

const saveConversationTurn = async (agentId: string, sessionId: string, userMessage: string, assistantResponse: string) => {
  const userTime = new Date()
  const assistantTime = new Date(userTime.getTime() + 1)
  await db.insert(conversationMessages).values([
    { agentId, sessionId, role: "user", content: userMessage, createdAt: userTime },
    { agentId, sessionId, role: "assistant", content: assistantResponse, createdAt: assistantTime },
  ])
  await db
    .update(conversationSessions)
    .set({ title: userMessage.slice(0, 50), updatedAt: new Date() })
    .where(and(eq(conversationSessions.id, sessionId), sql`title IS NULL`))
}

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

  const coreMemoryBlock = await buildCoreMemoryBlock(agentId)
  const agentToolNames = (agent.tools as ToolDefinition[]).map((t) => t.name)
  const needsRoster = agentToolNames.includes("askAgent") || agentToolNames.includes("getAgentHistory")
  const teamRoster = needsRoster ? await buildTeamRosterBlock(agentId) : ""
  const systemPrompt = buildDateContext() + "\n\n" + agent.systemPrompt + coreMemoryBlock + teamRoster

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

  if (inputContext) {
    await emitEvent(agentId, taskRun.id, "user_message", inputContext)
  }

  const agentTools = agent.tools as ToolDefinition[]
  const bedrockTools = buildBedrockTools(agentTools)

  const historyMessages = inputContext ? await loadConversationHistory(agentId) : []
  const messages: Message[] = [...historyMessages]

  if (inputContext) {
    messages.push({ role: "user", content: [{ text: inputContext }] })
  } else {
    messages.push({ role: "user", content: [{ text: "Execute your scheduled task." }] })
  }

  const agentWithPrompt = { id: agent.id, systemPrompt }
  const delegationCtx = agent.name === "Leader"
    ? { leaderAgentId: agentId, leaderTaskRunId: taskRun.id } as DelegationContext
    : undefined

  const failed = await runAgenticLoop(agentWithPrompt, taskRun.id, messages, agentTools, bedrockTools, delegationCtx)
    .then(() => false)
    .catch(async (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await db
        .update(taskRuns)
        .set({ status: "failed", output: { error: errorMessage }, completedAt: new Date() })
        .where(eq(taskRuns.id, taskRun.id))
      await emitEvent(agentId, taskRun.id, "error", errorMessage)
      return true
    })

  if (!failed && inputContext && trigger !== "cron") {
    const [completedRun] = await db.select().from(taskRuns).where(eq(taskRuns.id, taskRun.id))
    const output = completedRun?.output as { result?: string } | null
    if (output?.result) {
      const sessionId = await getOrCreateSession(agentId)
      await saveConversationTurn(agentId, sessionId, inputContext, output.result)
    }
  }

  const finalStatus = failed ? "error" : trigger === "cron" ? "has_report" : "idle"
  await updateAgentStatus(agentId, finalStatus)
  return taskRun
}

const runAgenticLoop = async (
  agent: { id: string; systemPrompt: string },
  taskRunId: string,
  messages: Message[],
  agentTools: ToolDefinition[],
  bedrockTools: any[],
  delegationCtx?: DelegationContext
): Promise<void> => {
  const accumulatedTexts: string[] = []
  let step = 0

  while (step < config.maxAgentSteps) {
    step++
    await updateAgentStatus(agent.id, "thinking")
    await emitEvent(agent.id, taskRunId, "thinking", "Processing...", { step })

    const result = await converse({
      messages,
      systemPrompt: agent.systemPrompt,
      tools: bedrockTools,
    })

    const textContent = extractTextContent(result.output)
    const toolUseBlocks = extractToolUseBlocks(result.output)

    if (textContent) {
      accumulatedTexts.push(textContent)
      await emitEvent(agent.id, taskRunId, "message", textContent)
    }

    if (result.stopReason !== "tool_use" || toolUseBlocks.length === 0) break

    await updateAgentStatus(agent.id, "working")
    messages.push({ role: "assistant", content: result.output })

    const guardedToolUse = toolUseBlocks.find((block) => {
      const classification = classifyToolCall(
        block.toolUse.name!,
        block.toolUse.input as Record<string, unknown>
      )
      return classification.level === "guarded"
    })

    if (guardedToolUse) {
      const { toolUse: guardedTool } = guardedToolUse
      const classification = classifyToolCall(
        guardedTool.name!,
        guardedTool.input as Record<string, unknown>
      )

      await db.insert(approvals).values({
        agentId: agent.id,
        taskRunId,
        toolName: guardedTool.name!,
        toolInput: guardedTool.input,
        status: "pending",
        suspendedMessages: messages,
      })

      await db
        .update(taskRuns)
        .set({ status: "waiting_approval" })
        .where(eq(taskRuns.id, taskRunId))

      await emitEvent(
        agent.id,
        taskRunId,
        "approval_needed",
        classification.reason ?? "Approval required",
        { toolName: guardedTool.name, toolInput: guardedTool.input }
      )

      await updateAgentStatus(agent.id, "waiting_approval")
      return
    }

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
        agentTools,
        delegationCtx
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
  }

  if (step >= config.maxAgentSteps) {
    await emitEvent(
      agent.id,
      taskRunId,
      "error",
      `Loop step cap reached (${config.maxAgentSteps}). Forcing termination.`
    )
  }

  const fullResponse = accumulatedTexts.join("\n\n")
  await db
    .update(taskRuns)
    .set({ status: "completed", output: { result: fullResponse }, completedAt: new Date() })
    .where(eq(taskRuns.id, taskRunId))
  await emitEvent(agent.id, taskRunId, "completed", fullResponse || "Task completed")
}

export const executeAgentForMeeting = async (
  agentId: string,
  question: string
): Promise<string> => {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent) return `Agent ${agentId} not found`

  const coreMemoryBlock = await buildCoreMemoryBlock(agentId)
  const agentWithMemory = { ...agent, systemPrompt: agent.systemPrompt + coreMemoryBlock }

  const agentTools = agentWithMemory.tools as ToolDefinition[]
  const bedrockTools = buildBedrockTools(agentTools)
  const messages: Message[] = [{ role: "user", content: [{ text: question }] }]

  const [taskRun] = await db
    .insert(taskRuns)
    .values({ agentId, trigger: "meeting", status: "running", input: { context: question }, startedAt: new Date() })
    .returning()

  await emitEvent(agentId, taskRun.id, "user_message", question)
  await updateAgentStatus(agentId, "thinking")
  await runAgenticLoop(agentWithMemory, taskRun.id, messages, agentTools, bedrockTools)
  await updateAgentStatus(agentId, "idle")

  const [completedRun] = await db.select().from(taskRuns).where(eq(taskRuns.id, taskRun.id))
  const output = completedRun?.output as { result?: string } | null
  return output?.result ?? "No response"
}

export const resumeAfterApproval = async (
  approvalId: string,
  action: "approve" | "reject"
) => {
  const [approval] = await db.select().from(approvals).where(eq(approvals.id, approvalId))
  if (!approval) return

  const savedMessages = approval.suspendedMessages as Message[] | null
  if (!savedMessages) return

  const [agent] = await db.select().from(agents).where(eq(agents.id, approval.agentId))
  if (!agent) return

  const lastAssistant = savedMessages[savedMessages.length - 1]
  const lastAssistantToolUses =
    (lastAssistant?.content as ContentBlock[] | undefined)
      ?.filter((b) => b.toolUse !== undefined)
      .map((b) => b.toolUse!) ?? []

  const approvedToolUse = lastAssistantToolUses.find(
    (t) => t.name === approval.toolName
  )

  let resumeContent: string
  let isError = false

  if (action === "approve") {
    const toolResult = await executeTool(
      agent.id,
      approval.toolName,
      approval.toolInput as Record<string, unknown>,
      agent.tools as ToolDefinition[]
    )
    resumeContent = toolResult.content
    isError = toolResult.isError ?? false
  } else {
    resumeContent = `Rejected by user. Do not execute ${approval.toolName}.`
  }

  const toolResultBlocks: ContentBlock[] = lastAssistantToolUses.map((tu) => {
    if (tu.toolUseId === approvedToolUse?.toolUseId) {
      return {
        toolResult: {
          toolUseId: tu.toolUseId!,
          content: [{ text: resumeContent }],
          status: isError ? "error" : "success",
        },
      }
    }
    return {
      toolResult: {
        toolUseId: tu.toolUseId!,
        content: [
          {
            text: "Operation cancelled by suspension. Re-issue in a separate turn if still needed.",
          },
        ],
        status: "success",
      },
    }
  })

  savedMessages.push({ role: "user", content: toolResultBlocks })

  await db
    .update(taskRuns)
    .set({ status: "running" })
    .where(eq(taskRuns.id, approval.taskRunId))
  await updateAgentStatus(approval.agentId, "working")

  const agentTools = agent.tools as ToolDefinition[]
  const bedrockTools = buildBedrockTools(agentTools)
  await runAgenticLoop(
    { id: agent.id, systemPrompt: agent.systemPrompt },
    approval.taskRunId,
    savedMessages,
    agentTools,
    bedrockTools
  )
  await updateAgentStatus(approval.agentId, "idle")
}

