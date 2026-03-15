import cron from "node-cron"
import { db } from "../db/client.js"
import { agents } from "../db/schema.js"
import { isNotNull } from "drizzle-orm"
import { executeAgent } from "../runtime/executor.js"

export const startScheduler = () => {
  const setupCronJobs = async () => {
    const scheduledAgents = await db
      .select()
      .from(agents)
      .where(isNotNull(agents.schedule))

    for (const agent of scheduledAgents) {
      if (!agent.schedule) continue

      console.log(`Scheduling ${agent.name}: ${agent.schedule}`)
      cron.schedule(agent.schedule, async () => {
        console.log(`Cron triggered for ${agent.name}`)
        try {
          await executeAgent(agent.id, "cron", agent.cronPrompt ?? undefined)
        } catch (error) {
          console.error(`Cron execution failed for ${agent.name}:`, error)
        }
      })
    }

    console.log(`Scheduled ${scheduledAgents.length} agent(s)`)
  }

  setupCronJobs().catch(console.error)
}
