import { db } from "../db/client.js"
import { agents, taskRuns, events } from "../db/schema.js"
import { eq, desc, and } from "drizzle-orm"
import { executeAgentForMeeting } from "../runtime/executor.js"

type ToolResult = { content: string; isError?: boolean }

const askAgent = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const agentId = input.agentId as string
  const question = input.question as string

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent) return { content: `Agent ${agentId} not found`, isError: true }

  if (agent.status === "working" || agent.status === "thinking") {
    const history = await getAgentHistory({ agentId, limit: 1 })
    return { content: `Agent is busy. Recent history: ${history.content}` }
  }

  const response = await executeAgentForMeeting(agentId, question)
  return { content: response }
}

const getAgentHistory = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const agentId = input.agentId as string
  const limit = (input.limit as number) ?? 5

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

const delegateTask = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const agentId = input.agentId as string
  const task = input.task as string

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent) return { content: `Agent ${agentId} not found`, isError: true }

  const { executeAgent } = await import("../runtime/executor.js")
  const taskRun = await executeAgent(agentId, "manual", task)

  return { content: `Task delegated. Task run ID: ${taskRun.id}` }
}

export const executeLeaderTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    askAgent,
    getAgentHistory,
    delegateTask,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown leader tool: ${toolName}`, isError: true }

  return handler(input)
}
