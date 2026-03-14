import "dotenv/config"
import { db } from "./client.js"
import { agents } from "./schema.js"

const leaderTools = [
  {
    name: "askAgent",
    description: "Query a specific agent for status or information. Spins up a short-lived execution for the target agent.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "The ID of the agent to query" },
        question: { type: "string", description: "The question to ask the agent" },
      },
      required: ["agentId", "question"],
    },
  },
  {
    name: "getAgentHistory",
    description: "Read-only DB query. Returns the last N completed task runs with outputs and recent events for an agent.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "The ID of the agent" },
        limit: { type: "number", description: "Number of recent task runs to return", default: 5 },
      },
      required: ["agentId"],
    },
  },
  {
    name: "delegateTask",
    description: "Create a new task for an agent and start it asynchronously. Returns the task run ID.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "The ID of the agent to delegate to" },
        task: { type: "string", description: "Description of the task to perform" },
      },
      required: ["agentId", "task"],
    },
  },
]

const seedAgents = async () => {
  console.log("Seeding agents...")

  await db.insert(agents).values([
    {
      name: "Leader",
      role: "Chief of Staff",
      systemPrompt: `You are the Leader agent in the ozap-office digital office. You orchestrate a team of AI agents that handle different aspects of the business.

Your responsibilities:
- Coordinate and monitor other agents
- Run team meetings and consolidate status reports
- Delegate tasks to appropriate agents
- Provide executive summaries when asked

Use askAgent to query agents directly, getAgentHistory to check their recent work, and delegateTask to assign new work. If no other agents are available yet, report that the team is still being assembled.`,
      tools: leaderTools,
      schedule: null,
      color: "#4a9eff",
      positionX: 2,
      positionY: 2,
    },
  ])

  console.log("Seed complete.")
  process.exit(0)
}

seedAgents().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
