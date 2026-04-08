import { db } from "./db/client.js"
import { agents, taskRuns, events } from "./db/schema.js"
import { eq, inArray } from "drizzle-orm"

export const recoverOrphanedTaskRuns = async () => {
  const orphanedRunning = await db
    .select()
    .from(taskRuns)
    .where(eq(taskRuns.status, "running"))

  const affectedAgentIds = new Set<string>()

  for (const run of orphanedRunning) {
    console.log(`Marking orphaned task_run ${run.id} as failed`)
    affectedAgentIds.add(run.agentId)
    await db
      .update(taskRuns)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(taskRuns.id, run.id))

    await db.insert(events).values({
      agentId: run.agentId,
      taskRunId: run.id,
      type: "error",
      content: "Task run interrupted by server restart",
      timestamp: new Date(),
    })
  }

  for (const agentId of affectedAgentIds) {
    await db.update(agents).set({ status: "idle", updatedAt: new Date() }).where(eq(agents.id, agentId))
  }

  if (orphanedRunning.length > 0) {
    console.log(`Recovered ${orphanedRunning.length} orphaned task run(s)`)
  }

  const waitingApprovals = await db
    .select()
    .from(taskRuns)
    .where(eq(taskRuns.status, "waiting_approval"))

  if (waitingApprovals.length > 0) {
    console.log(`${waitingApprovals.length} task run(s) still waiting for approval`)
  }
}
