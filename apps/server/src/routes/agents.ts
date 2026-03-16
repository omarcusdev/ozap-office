import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { agents, events, taskRuns } from "../db/schema.js"
import { eq, gt, and, desc } from "drizzle-orm"
import { executeAgent } from "../runtime/executor.js"
import { eventBus } from "../events/event-bus.js"

export const registerAgentRoutes = (server: FastifyInstance) => {
  server.get("/api/agents", async () => {
    return db.select().from(agents)
  })

  server.get<{ Params: { id: string } }>("/api/agents/:id", async (request, reply) => {
    const [agent] = await db.select().from(agents).where(eq(agents.id, request.params.id))
    if (!agent) return reply.code(404).send({ error: "Agent not found" })
    return agent
  })

  server.get<{ Params: { id: string } }>("/api/agents/:id/latest-run", async (request, reply) => {
    const [run] = await db
      .select()
      .from(taskRuns)
      .where(eq(taskRuns.agentId, request.params.id))
      .orderBy(desc(taskRuns.createdAt))
      .limit(1)

    if (!run) return reply.code(404).send({ error: "No task runs found" })
    return run
  })

  server.get<{
    Params: { id: string }
    Querystring: { after?: string; taskRunId?: string }
  }>("/api/agents/:id/events", async (request) => {
    const { id } = request.params
    const { after, taskRunId } = request.query

    const conditions = [eq(events.agentId, id)]
    if (after) conditions.push(gt(events.timestamp, new Date(after)))
    if (taskRunId) conditions.push(eq(events.taskRunId, taskRunId))

    return db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(events.timestamp)
      .limit(100)
  })

  server.post<{ Params: { id: string }; Body: { message?: string } }>("/api/agents/:id/run", async (request, reply) => {
    const [agent] = await db.select().from(agents).where(eq(agents.id, request.params.id))
    if (!agent) return reply.code(404).send({ error: "Agent not found" })

    const message = (request.body as any)?.message
    const taskRun = await executeAgent(agent.id, "manual", message || undefined)
    return { taskRunId: taskRun.id }
  })

  server.post<{ Params: { id: string } }>("/api/agents/:id/read", async (request, reply) => {
    const [agent] = await db.select().from(agents).where(eq(agents.id, request.params.id))
    if (!agent) return reply.code(404).send({ error: "Agent not found" })

    if (agent.status === "has_report") {
      await db.update(agents).set({ status: "idle", updatedAt: new Date() }).where(eq(agents.id, agent.id))
      eventBus.emit("agentStatus", { agentId: agent.id, status: "idle" })
    }

    return { status: "ok" }
  })
}
