import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { agents, events, taskRuns, conversationMessages, conversationSessions } from "../db/schema.js"
import { eq, gt, and, desc } from "drizzle-orm"
import { executeAgent } from "../runtime/executor.js"
import { eventBus } from "../events/event-bus.js"
import { validateInferenceConfig } from "../runtime/validate-inference-config.js"
import type { InferenceConfig } from "@ozap-office/shared"

export const registerAgentRoutes = (server: FastifyInstance) => {
  server.patch<{
    Params: { id: string }
    Body: { inferenceConfig: InferenceConfig | null }
  }>("/api/agents/:id", async (request, reply) => {
    const { id } = request.params
    const { inferenceConfig } = request.body

    const validation = validateInferenceConfig(inferenceConfig)
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.message })
    }

    const [updated] = await db
      .update(agents)
      .set({ inferenceConfig, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning()

    if (!updated) return reply.code(404).send({ error: "Agent not found" })

    return updated
  })

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

  server.get<{ Params: { id: string } }>("/api/agents/:id/conversation", async (request) => {
    return db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.agentId, request.params.id))
      .orderBy(conversationMessages.createdAt)
      .limit(50)
  })

  server.delete<{ Params: { id: string } }>("/api/agents/:id/conversation", async (request) => {
    await db.delete(conversationMessages).where(eq(conversationMessages.agentId, request.params.id))
    return { status: "ok" }
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

  server.get<{ Params: { id: string } }>("/api/agents/:id/sessions", async (request) => {
    return db
      .select()
      .from(conversationSessions)
      .where(eq(conversationSessions.agentId, request.params.id))
      .orderBy(desc(conversationSessions.updatedAt))
      .limit(50)
  })

  server.post<{ Params: { id: string } }>("/api/agents/:id/sessions", async (request) => {
    const [session] = await db
      .insert(conversationSessions)
      .values({ agentId: request.params.id })
      .returning()
    return session
  })

  server.delete<{ Params: { id: string; sessionId: string } }>(
    "/api/agents/:id/sessions/:sessionId",
    async (request) => {
      await db
        .delete(conversationMessages)
        .where(eq(conversationMessages.sessionId, request.params.sessionId))
      await db
        .delete(conversationSessions)
        .where(eq(conversationSessions.id, request.params.sessionId))
      return { status: "ok" }
    }
  )

  server.get<{ Params: { id: string; sessionId: string } }>(
    "/api/agents/:id/sessions/:sessionId/messages",
    async (request) => {
      return db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.sessionId, request.params.sessionId))
        .orderBy(conversationMessages.createdAt)
        .limit(100)
    }
  )
}
