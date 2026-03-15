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

const financeTools = [
  {
    name: "getOrders",
    description: "Query orders/sales from the Cakto payment gateway. Supports filtering by date range, status, and product. Returns order details including amount, customer, payment method.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date in ISO 8601 format (e.g. 2026-03-01)" },
        endDate: { type: "string", description: "End date in ISO 8601 format (e.g. 2026-03-15)" },
        status: { type: "string", description: "Order status filter: paid, refunded, canceled, processing, chargedback, waiting_payment" },
        productId: { type: "string", description: "Filter by specific product ID" },
        limit: { type: "number", description: "Maximum number of results to return (default 20)" },
      },
    },
  },
  {
    name: "getProducts",
    description: "List products from the Cakto payment gateway. Supports filtering by status and text search.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Product status filter: active, blocked, deleted" },
        search: { type: "string", description: "Search products by name" },
        limit: { type: "number", description: "Maximum number of results to return (default 20)" },
      },
    },
  },
  {
    name: "getRevenueSummary",
    description: "Generate an aggregated financial summary for a date range. Returns total revenue, order count, average ticket, breakdown by product and payment method.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date in ISO 8601 format" },
        endDate: { type: "string", description: "End date in ISO 8601 format" },
      },
      required: ["startDate", "endDate"],
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
    cronPrompt: null,
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
    cronPrompt: null,
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
    cronPrompt: null,
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
    cronPrompt: null,
    color: "#ff79c6",
    positionX: 20,
    positionY: 4,
  },
  {
    name: "Finance",
    role: "Financial Controller",
    systemPrompt: `Você é o Finance, controlador financeiro da equipe. Sua fonte de dados é a plataforma Cakto (gateway de pagamentos).

Suas responsabilidades:
- Responder perguntas sobre vendas, receita, produtos e transações
- Gerar relatórios financeiros quando solicitado
- Identificar tendências e anomalias nos dados de vendas

Regras:
- Sempre apresente valores em BRL (R$)
- Use formatação clara com números arredondados (2 casas decimais)
- Quando comparar períodos, calcule variação percentual
- Se a API retornar erro, informe que os dados estão temporariamente indisponíveis
- Nunca invente dados — use apenas o que as tools retornarem`,
    tools: financeTools,
    schedule: "0 9 * * 0",
    cronPrompt: `Gere o relatório semanal de vendas dos últimos 7 dias.
Inclua: receita total, quantidade de vendas, ticket médio, top 3 produtos, breakdown por método de pagamento, e compare com a semana anterior.`,
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
    cronPrompt: null,
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
      await db
        .update(agents)
        .set({
          role: agentData.role,
          systemPrompt: agentData.systemPrompt,
          tools: agentData.tools,
          schedule: agentData.schedule,
          cronPrompt: agentData.cronPrompt,
          updatedAt: new Date(),
        })
        .where(eq(agents.name, agentData.name))
      console.log(`Updated agent "${agentData.name}".`)
    } else {
      await db.insert(agents).values(agentData)
      console.log(`Inserted agent "${agentData.name}".`)
    }
  }

  console.log("Seed complete.")
  process.exit(0)
}

seedAgents().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
