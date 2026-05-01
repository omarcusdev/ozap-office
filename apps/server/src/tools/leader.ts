import { nanoid } from "nanoid"
import { db } from "../db/client.js"
import { agents, taskRuns, events } from "../db/schema.js"
import { eq, desc, and } from "drizzle-orm"
import { executeAgentForMeeting } from "../runtime/executor.js"
import { eventBus } from "../events/event-bus.js"
import type { AgentEventType } from "@ozap-office/shared"

type ToolResult = { content: string; isError?: boolean }

export type DelegationContext = {
  leaderAgentId: string
  leaderTaskRunId: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const invalidAgentIdError = (received: string): ToolResult => ({
  content: `agentId must be a UUID, got "${received}". Use the agent IDs from the team roster injected in your system prompt — names like "Promo" or "Leader" don't work, only UUIDs.`,
  isError: true,
})

const emitDelegationEvent = async (
  ctx: DelegationContext,
  type: AgentEventType,
  content: string,
  metadata: Record<string, unknown>
) => {
  const [event] = await db
    .insert(events)
    .values({
      agentId: ctx.leaderAgentId,
      taskRunId: ctx.leaderTaskRunId,
      type,
      content,
      metadata,
      timestamp: new Date(),
    })
    .returning()

  eventBus.emit("agentEvent", event as any)
}

const askAgent = async (input: Record<string, unknown>, ctx?: DelegationContext): Promise<ToolResult> => {
  const agentId = input.agentId as string
  const question = input.question as string

  if (!UUID_RE.test(agentId)) return invalidAgentIdError(agentId)

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent) return { content: `Agent ${agentId} not found`, isError: true }

  if (agent.status === "working" || agent.status === "thinking") {
    const history = await getAgentHistory({ agentId, limit: 1 })
    return { content: `Agent is busy. Recent history: ${history.content}` }
  }

  const delegationId = nanoid(10)

  if (ctx) {
    await emitDelegationEvent(ctx, "delegation_start", `Asking ${agent.name}: ${question}`, {
      delegationId,
      targetAgentId: agentId,
      targetAgentName: agent.name,
      question,
    })
  }

  const response = await executeAgentForMeeting(agentId, question)

  if (ctx) {
    await emitDelegationEvent(ctx, "delegation_response", response, {
      delegationId,
      targetAgentId: agentId,
      targetAgentName: agent.name,
      response,
    })
  }

  return { content: response }
}

const getAgentHistory = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const agentId = input.agentId as string
  const limit = (input.limit as number) ?? 5

  if (!UUID_RE.test(agentId)) return invalidAgentIdError(agentId)

  const recentRuns = await db
    .select()
    .from(taskRuns)
    .where(and(eq(taskRuns.agentId, agentId), eq(taskRuns.status, "completed")))
    .orderBy(desc(taskRuns.createdAt))
    .limit(limit)

  const recentEvents = await db
    .select()
    .from(events)
    .where(eq(events.agentId, agentId))
    .orderBy(desc(events.timestamp))
    .limit(20)

  return {
    content: JSON.stringify({
      recentRuns: recentRuns.map((r) => ({ id: r.id, trigger: r.trigger, output: r.output, completedAt: r.completedAt })),
      recentEvents: recentEvents.map((e) => ({ type: e.type, content: e.content, timestamp: e.timestamp })),
    }),
  }
}

const delegateTask = async (input: Record<string, unknown>, ctx?: DelegationContext): Promise<ToolResult> => {
  const agentId = input.agentId as string
  const task = input.task as string

  if (!UUID_RE.test(agentId)) return invalidAgentIdError(agentId)

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent) return { content: `Agent ${agentId} not found`, isError: true }

  const delegationId = nanoid(10)

  if (ctx) {
    await emitDelegationEvent(ctx, "delegation_start", `Delegating to ${agent.name}: ${task}`, {
      delegationId,
      targetAgentId: agentId,
      targetAgentName: agent.name,
      task,
    })
  }

  const { executeAgent } = await import("../runtime/executor.js")
  const taskRun = await executeAgent(agentId, "manual", task)

  const [completedRun] = await db.select().from(taskRuns).where(eq(taskRuns.id, taskRun.id))
  const output = completedRun?.output as { result?: string } | null

  if (ctx) {
    await emitDelegationEvent(ctx, "delegation_response", output?.result ?? "Task completed", {
      delegationId,
      targetAgentId: agentId,
      targetAgentName: agent.name,
      response: output?.result ?? "Task completed",
    })
  }

  return { content: `Task delegated and completed. Response: ${output?.result ?? "Task completed"}` }
}

export const executeLeaderTool = async (
  toolName: string,
  input: Record<string, unknown>,
  delegationCtx?: DelegationContext
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>, ctx?: DelegationContext) => Promise<ToolResult>> = {
    askAgent,
    getAgentHistory,
    delegateTask,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown leader tool: ${toolName}`, isError: true }

  return handler(input, delegationCtx)
}
