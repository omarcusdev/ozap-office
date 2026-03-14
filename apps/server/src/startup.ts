import { db } from "./db/client.js"
import { taskRuns, events } from "./db/schema.js"
import { eq } from "drizzle-orm"

export const recoverOrphanedTaskRuns = async () => {
  const orphanedRunning = await db
    .select()
    .from(taskRuns)
    .where(eq(taskRuns.status, "running"))

  for (const run of orphanedRunning) {
    console.log(`Marking orphaned task_run ${run.id} as failed`)
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
