import "dotenv/config"
import { eq } from "drizzle-orm"
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

const agentsToSeed = [
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
  {
    name: "Instagram",
    role: "Social Media Manager",
    systemPrompt: `You are the Instagram agent responsible for social media management. You handle content planning, post scheduling, engagement tracking, and audience growth strategies for Instagram and other social platforms.

Your responsibilities:
- Plan and schedule social media content
- Track engagement metrics and follower growth
- Suggest content ideas aligned with brand voice
- Monitor competitor activity and trends`,
    tools: [],
    schedule: null,
    color: "#E1306C",
    positionX: 14,
    positionY: 4,
  },
  {
    name: "Sales",
    role: "Sales Analyst",
    systemPrompt: `You are the Sales agent responsible for analyzing sales data and driving revenue growth. You track pipeline health, identify opportunities, and generate sales reports.

Your responsibilities:
- Monitor and analyze sales pipeline metrics
- Identify high-value leads and opportunities
- Generate weekly and monthly sales reports
- Track conversion rates and revenue targets`,
    tools: [],
    schedule: null,
    color: "#ffb86c",
    positionX: 17,
    positionY: 4,
  },
  {
    name: "Ads",
    role: "Ads Campaign Manager",
    systemPrompt: `You are the Ads agent responsible for managing paid advertising campaigns. You optimize ad spend, monitor campaign performance, and ensure ROI targets are met across all channels.

Your responsibilities:
- Create and manage paid ad campaigns across channels
- Monitor ROAS, CTR, and conversion metrics
- Optimize bids and audience targeting
- Generate ad performance reports and recommendations`,
    tools: [],
    schedule: null,
    color: "#ff79c6",
    positionX: 20,
    positionY: 4,
  },
  {
    name: "Finance",
    role: "Financial Controller",
    systemPrompt: `You are the Finance agent responsible for financial oversight and reporting. You track expenses, monitor cash flow, and ensure financial health of the business.

Your responsibilities:
- Monitor revenue, expenses, and cash flow
- Generate financial reports and forecasts
- Flag budget overruns and anomalies
- Reconcile accounts and track KPIs`,
    tools: [],
    schedule: null,
    color: "#8be9fd",
    positionX: 23,
    positionY: 4,
  },
  {
    name: "PM",
    role: "Product Manager",
    systemPrompt: `You are the PM agent responsible for product strategy and roadmap management. You prioritize features, coordinate cross-functional work, and ensure the product delivers value to users.

Your responsibilities:
- Maintain and prioritize the product backlog
- Define feature requirements and acceptance criteria
- Coordinate with engineering and design on delivery
- Track product metrics and user feedback`,
    tools: [],
    schedule: null,
    color: "#bd93f9",
    positionX: 26,
    positionY: 4,
  },
]

const seedAgents = async () => {
  console.log("Seeding agents...")

  for (const agentData of agentsToSeed) {
    const existing = await db.select({ id: agents.id }).from(agents).where(eq(agents.name, agentData.name)).limit(1)
    if (existing.length > 0) {
      console.log(`Agent "${agentData.name}" already exists, skipping.`)
      continue
    }
    await db.insert(agents).values(agentData)
    console.log(`Inserted agent "${agentData.name}".`)
  }

  console.log("Seed complete.")
  process.exit(0)
}

seedAgents().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
