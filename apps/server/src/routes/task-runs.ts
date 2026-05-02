import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { taskRuns } from "../db/schema.js"
import { eq, desc } from "drizzle-orm"
import { cancelTaskRun } from "../runtime/executor.js"

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

  server.post<{ Params: { id: string } }>("/api/task-runs/:id/cancel", async (request, reply) => {
    const cancelled = cancelTaskRun(request.params.id)
    if (!cancelled) {
      return reply.code(404).send({ error: "No active run with that id (already finished or never started)" })
    }
    return { status: "cancelling" }
  })
}
