import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { agents, events } from "../db/schema.js"
import { eq, gt, and } from "drizzle-orm"
import { executeAgent } from "../runtime/executor.js"

export const registerAgentRoutes = (server: FastifyInstance) => {
  server.get("/api/agents", async () => {
    return db.select().from(agents)
  })

  server.get<{ Params: { id: string } }>("/api/agents/:id", async (request, reply) => {
    const [agent] = await db.select().from(agents).where(eq(agents.id, request.params.id))
    if (!agent) return reply.code(404).send({ error: "Agent not found" })
    return agent
  })

  server.get<{
    Params: { id: string }
    Querystring: { after?: string }
  }>("/api/agents/:id/events", async (request) => {
    const { id } = request.params
    const { after } = request.query

    const conditions = [eq(events.agentId, id)]
    if (after) conditions.push(gt(events.timestamp, new Date(after)))

    return db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(events.timestamp)
      .limit(100)
  })

  server.post<{ Params: { id: string } }>("/api/agents/:id/run", async (request, reply) => {
    const [agent] = await db.select().from(agents).where(eq(agents.id, request.params.id))
    if (!agent) return reply.code(404).send({ error: "Agent not found" })

    const taskRun = await executeAgent(agent.id, "manual")
    return { taskRunId: taskRun.id }
  })
}
