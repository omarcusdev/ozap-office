import cron from "node-cron"
import { db } from "../db/client.js"
import { agents } from "../db/schema.js"
import { isNotNull } from "drizzle-orm"
import { executeAgent } from "../runtime/executor.js"
import { syncRevenue } from "../ingestion/revenue-sync.js"
import { syncOpenAICosts } from "../ingestion/openai-cost-sync.js"
import { seedCosts } from "../db/seed/costs.js"

const MAX_JITTER_MS = 45 * 60 * 1000

const randomDelay = () => Math.floor(Math.random() * MAX_JITTER_MS)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
        const jitter = randomDelay()
        const delayMin = Math.round(jitter / 60000)
        console.log(`Cron triggered for ${agent.name}, delaying ${delayMin}min`)
        await sleep(jitter)
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

  cron.schedule("0 9 * * *", async () => {
    console.log("[revenue-sync] cron triggered")
    try {
      await syncRevenue()
    } catch (err) {
      console.error("[revenue-sync] cron failed:", err)
    }
    console.log("[openai-cost-sync] cron triggered")
    try {
      const result = await syncOpenAICosts()
      console.log("[openai-cost-sync]", JSON.stringify(result))
    } catch (err) {
      console.error("[openai-cost-sync] cron failed:", err)
    }
    console.log("[recurring-costs] cron triggered")
    try {
      await seedCosts()
    } catch (err) {
      console.error("[recurring-costs] cron failed:", err)
    }
  })
  console.log("Scheduled daily revenue + OpenAI + recurring costs sync at 09:00 UTC (06:00 BRT)")
}
