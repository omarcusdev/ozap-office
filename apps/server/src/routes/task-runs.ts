import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { taskRuns } from "../db/schema.js"
import { eq, desc } from "drizzle-orm"

export const registerTaskRunRoutes = (server: FastifyInstance) => {
  server.get<{ Querystring: { agentId?: string } }>("/api/task-runs", async (request) => {
    const { agentId } = request.query
    const query = db.select().from(taskRuns).orderBy(desc(taskRuns.createdAt)).limit(50)

    if (agentId) return query.where(eq(taskRuns.agentId, agentId))
    return query
  })

  server.get<{ Params: { id: string } }>("/api/task-runs/:id", async (request, reply) => {
    const [run] = await db.select().from(taskRuns).where(eq(taskRuns.id, request.params.id))
    if (!run) return reply.code(404).send({ error: "Task run not found" })
    return run
  })
}
