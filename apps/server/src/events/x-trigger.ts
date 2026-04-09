import { db } from "../db/client.js"
import { agents } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { eventBus } from "./event-bus.js"
import { executeAgent } from "../runtime/executor.js"
import type { AgentEvent } from "@ozap-office/shared"

const NOTABLE_TOOLS = [
  "updatePromoConfig",
  "activateCampaign",
  "pauseCampaign",
  "getRevenueSummary",
]

const COOLDOWN_MS = 60 * 60 * 1000

const buildEventPrompt = (agentName: string, summary: string) =>
  `o agente ${agentName} acabou de completar uma tarefa.\n\ncontexto: ${summary}\n\nse for algo interessante, posta sobre isso no x. se n for, ignora.\ncheca seus tweets recentes antes pra n repetir tema.`

const isNotableEvent = (event: AgentEvent): boolean => {
  if (event.type === "completed") return true

  if (event.type === "tool_result") {
    const toolName = (event.metadata as Record<string, unknown>)?.toolName as string | undefined
    return toolName !== undefined && NOTABLE_TOOLS.includes(toolName)
  }

  return false
}

export const registerXTrigger = async () => {
  const [xAgent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.name, "X"))

  if (!xAgent) {
    console.log("X agent not found — skipping X trigger registration")
    return
  }

  const xAgentId = xAgent.id
  let lastTriggerAt = 0

  eventBus.on("agentEvent", async (event) => {
    if (event.agentId === xAgentId) return
    if (!isNotableEvent(event)) return

    const now = Date.now()
    if (now - lastTriggerAt < COOLDOWN_MS) return
    lastTriggerAt = now

    const [sourceAgent] = await db
      .select({ name: agents.name, status: agents.status })
      .from(agents)
      .where(eq(agents.id, event.agentId))

    if (!sourceAgent) return

    const [currentX] = await db
      .select({ status: agents.status })
      .from(agents)
      .where(eq(agents.id, xAgentId))

    if (currentX?.status !== "idle") return

    const summary = event.content.slice(0, 500)
    const prompt = buildEventPrompt(sourceAgent.name, summary)

    console.log(`X trigger: notable event from ${sourceAgent.name} — triggering X agent`)
    executeAgent(xAgentId, "event", prompt).catch((err) => {
      console.error("X event-driven execution failed:", err)
    })
  })

  console.log("X trigger registered: event listener for notable agent events")
}
