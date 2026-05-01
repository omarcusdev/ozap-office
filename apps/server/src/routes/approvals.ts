import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { approvals } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { resumeAfterApproval } from "../runtime/executor.js"
import { eventBus } from "../events/event-bus.js"

export const registerApprovalRoutes = (server: FastifyInstance) => {
  server.get("/api/approvals", async () => {
    return db.select().from(approvals).where(eq(approvals.status, "pending"))
  })

  server.post<{
    Params: { id: string }
    Body: { action: "approve" | "reject" }
  }>("/api/approvals/:id", async (request, reply) => {
    const { id } = request.params
    const { action } = request.body

    const [approval] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, id))

    if (!approval) return reply.code(404).send({ error: "Approval not found" })
    if (approval.status !== "pending")
      return reply.code(400).send({ error: "Approval already decided" })

    await db
      .update(approvals)
      .set({
        status: action === "approve" ? "approved" : "rejected",
        decidedAt: new Date(),
      })
      .where(eq(approvals.id, id))

    eventBus.emit("agentEvent", {
      id: crypto.randomUUID(),
      agentId: approval.agentId,
      taskRunId: approval.taskRunId,
      type: "approval_decided",
      content: action === "approve" ? "Approved" : "Rejected",
      metadata: { approvalId: approval.id, toolName: approval.toolName },
      timestamp: new Date(),
    })

    await resumeAfterApproval(approval.id, action)

    return { status: action === "approve" ? "approved" : "rejected" }
  })
}
