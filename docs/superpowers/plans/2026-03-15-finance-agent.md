# Finance Agent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Functionalize the Finance agent with Cakto API integration for on-demand financial queries and weekly automated reports.

**Architecture:** Direct API calls to Cakto via a dedicated client module with OAuth2 token management. Three tools (getOrders, getProducts, getRevenueSummary) registered in the Finance agent. Weekly cron on Sundays at 9am generates a report and sets a `has_report` visual badge.

**Tech Stack:** Cakto REST API, OAuth2, node-cron, Fastify, Drizzle ORM, Bedrock Claude, Next.js Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-03-15-finance-agent-design.md`

---

## Chunk 1: Foundation (Types + Schema + Config)

### Task 1: Update shared types and constants

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/constants.ts`

- [ ] **Step 1: Add `"has_report"` to AgentStatus and `cronPrompt` to AgentConfig**

In `packages/shared/src/types.ts`, change line 1:

```typescript
// FROM:
export type AgentStatus = "idle" | "working" | "thinking" | "waiting" | "meeting" | "error"

// TO:
export type AgentStatus = "idle" | "working" | "thinking" | "waiting" | "meeting" | "error" | "has_report"
```

In `packages/shared/src/types.ts`, add `cronPrompt` to `AgentConfig` (after `schedule` on line 9):

```typescript
export type AgentConfig = {
  id: string
  name: string
  role: string
  systemPrompt: string
  tools: ToolDefinition[]
  schedule: string | null
  cronPrompt: string | null
  color: string
  position: { x: number; y: number }
  status: AgentStatus
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Update AGENT_STATUSES constant**

In `packages/shared/src/constants.ts`, change line 1:

```typescript
// FROM:
export const AGENT_STATUSES = ["idle", "working", "thinking", "waiting", "meeting", "error"] as const

// TO:
export const AGENT_STATUSES = ["idle", "working", "thinking", "waiting", "meeting", "error", "has_report"] as const
```

- [ ] **Step 3: Build shared package and verify**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/shared build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add packages/shared/src/types.ts packages/shared/src/constants.ts
git commit -m "feat: add has_report status and cronPrompt to shared types"
```

---

### Task 2: Add cronPrompt column to DB schema and run migration

**Files:**
- Modify: `apps/server/src/db/schema.ts`

- [ ] **Step 1: Add cronPrompt column to agents table**

In `apps/server/src/db/schema.ts`, add after line 10 (`schedule: text("schedule"),`):

```typescript
  cronPrompt: text("cron_prompt"),
```

The agents table definition should look like:

```typescript
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  tools: jsonb("tools").notNull().default(sql`'[]'`),
  schedule: text("schedule"),
  cronPrompt: text("cron_prompt"),
  color: text("color").notNull(),
  positionX: integer("position_x").notNull(),
  positionY: integer("position_y").notNull(),
  status: text("status").notNull().default("idle"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 2: Generate and run Drizzle migration**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server db:generate`
Expected: Migration file generated in drizzle output folder.

Note: The migration will need to be run on the EC2 PostgreSQL. For now, just generate it. It will be applied during deployment.

- [ ] **Step 3: Typecheck server**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/server/src/db/schema.ts
git add -A apps/server/drizzle/  # migration files if generated locally
git commit -m "feat: add cronPrompt column to agents schema"
```

---

### Task 3: Add Cakto env vars to config

**Files:**
- Modify: `apps/server/src/config.ts`

- [ ] **Step 1: Add optional Cakto credentials**

In `apps/server/src/config.ts`, add after `corsOrigin` (line 12):

```typescript
const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const config = {
  databaseUrl: requireEnv("DATABASE_URL"),
  apiKey: requireEnv("OZAP_OFFICE_API_KEY"),
  awsRegion: process.env.AWS_REGION ?? "us-east-1",
  port: Number(process.env.PORT ?? 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  caktoClientId: process.env.CAKTO_CLIENT_ID ?? "",
  caktoClientSecret: process.env.CAKTO_CLIENT_SECRET ?? "",
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/server/src/config.ts
git commit -m "feat: add Cakto API credentials to config"
```

---

## Chunk 2: Cakto Integration (Client + Tools + Routing)

### Task 4: Create Cakto API client

**Files:**
- Create: `apps/server/src/integrations/cakto-client.ts`

- [ ] **Step 1: Create the integrations directory and Cakto client**

Create `apps/server/src/integrations/cakto-client.ts`:

```typescript
import { config } from "../config.js"

type OrderFilters = {
  startDate?: string
  endDate?: string
  status?: string
  productId?: string
  limit?: number
  page?: number
}

type ProductFilters = {
  status?: string
  search?: string
  limit?: number
  page?: number
}

type PaginatedResponse<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

type CaktoOrder = {
  id: string
  refId: string
  status: string
  type: string
  amount: number | null
  baseAmount: number
  discount: number | null
  product: { id: string; name: string; price: number }
  customer: { name: string; email?: string }
  paymentMethod: string
  installments: number
  paidAt: string | null
  createdAt: string
  refundedAt: string | null
  chargedbackAt: string | null
}

type CaktoProduct = {
  id: string
  name: string
  price: number
  type: string
  status: string
  category: { id: string; name: string }
}

type TokenState = {
  accessToken: string
  expiresAt: number
}

const CAKTO_BASE_URL = "https://api.cakto.com.br"
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000

const tokenState: { current: TokenState | null } = { current: null }

const assertCredentials = () => {
  if (!config.caktoClientId || !config.caktoClientSecret) {
    throw new Error("Cakto API credentials not configured (CAKTO_CLIENT_ID, CAKTO_CLIENT_SECRET)")
  }
}

const fetchToken = async (): Promise<TokenState> => {
  assertCredentials()

  const response = await fetch(`${CAKTO_BASE_URL}/public_api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.caktoClientId,
      client_secret: config.caktoClientSecret,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cakto auth failed (${response.status}): ${text}`)
  }

  const data = await response.json() as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

const getValidToken = async (): Promise<string> => {
  if (!tokenState.current || Date.now() >= tokenState.current.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    tokenState.current = await fetchToken()
  }
  return tokenState.current.accessToken
}

const caktoRequest = async <T>(path: string, retried = false): Promise<T> => {
  const token = await getValidToken()

  const response = await fetch(`${CAKTO_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (response.status === 401 && !retried) {
    tokenState.current = null
    return caktoRequest<T>(path, true)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cakto API error (${response.status}): ${text}`)
  }

  return response.json() as Promise<T>
}

const buildOrderQuery = (filters: OrderFilters): string => {
  const params = new URLSearchParams()
  if (filters.startDate) params.set("createdAt__gte", filters.startDate)
  if (filters.endDate) params.set("createdAt__lte", filters.endDate)
  if (filters.status) params.set("status", filters.status)
  if (filters.productId) params.set("product", filters.productId)
  params.set("limit", String(filters.limit ?? 50))
  if (filters.page) params.set("page", String(filters.page))
  params.set("ordering", "-createdAt")
  return params.toString()
}

const buildProductQuery = (filters: ProductFilters): string => {
  const params = new URLSearchParams()
  if (filters.status) params.set("status", filters.status)
  if (filters.search) params.set("search", filters.search)
  params.set("limit", String(filters.limit ?? 50))
  if (filters.page) params.set("page", String(filters.page))
  return params.toString()
}

export const fetchOrders = async (filters: OrderFilters = {}): Promise<PaginatedResponse<CaktoOrder>> =>
  caktoRequest<PaginatedResponse<CaktoOrder>>(`/public_api/orders/?${buildOrderQuery(filters)}`)

export const fetchProducts = async (filters: ProductFilters = {}): Promise<PaginatedResponse<CaktoProduct>> =>
  caktoRequest<PaginatedResponse<CaktoProduct>>(`/public_api/products/?${buildProductQuery(filters)}`)

export const fetchOrderById = async (orderId: string): Promise<CaktoOrder> =>
  caktoRequest<CaktoOrder>(`/public_api/orders/${orderId}/`)

export const fetchAllOrders = async (filters: OrderFilters): Promise<CaktoOrder[]> => {
  const MAX_ORDERS = 500
  const allOrders: CaktoOrder[] = []
  const pageSize = 50
  const maxPages = Math.ceil(MAX_ORDERS / pageSize)

  for (let page = 1; page <= maxPages; page++) {
    const response = await fetchOrders({ ...filters, limit: pageSize, page })
    allOrders.push(...response.results)
    if (!response.next || allOrders.length >= MAX_ORDERS) break
  }

  return allOrders.slice(0, MAX_ORDERS)
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/server/src/integrations/cakto-client.ts
git commit -m "feat: add Cakto API client with OAuth2 token management"
```

---

### Task 5: Create Finance agent tools

**Files:**
- Create: `apps/server/src/tools/finance.ts`

- [ ] **Step 1: Create finance tools file**

Create `apps/server/src/tools/finance.ts`:

```typescript
import { fetchOrders, fetchProducts, fetchAllOrders } from "../integrations/cakto-client.js"

type ToolResult = { content: string; isError?: boolean }

const getOrders = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const response = await fetchOrders({
      startDate: input.startDate as string | undefined,
      endDate: input.endDate as string | undefined,
      status: input.status as string | undefined,
      productId: input.productId as string | undefined,
      limit: (input.limit as number) ?? 20,
    })

    const orders = response.results.map((o) => ({
      id: o.id,
      refId: o.refId,
      status: o.status,
      amount: o.amount,
      product: o.product.name,
      customer: o.customer.name,
      paymentMethod: o.paymentMethod,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
    }))

    return { content: JSON.stringify({ count: response.count, orders }) }
  } catch (error) {
    return { content: `Failed to fetch orders: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getProducts = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const response = await fetchProducts({
      status: input.status as string | undefined,
      search: input.search as string | undefined,
      limit: (input.limit as number) ?? 20,
    })

    const products = response.results.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      type: p.type,
      status: p.status,
      category: p.category.name,
    }))

    return { content: JSON.stringify({ count: response.count, products }) }
  } catch (error) {
    return { content: `Failed to fetch products: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getRevenueSummary = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const startDate = input.startDate as string
    const endDate = input.endDate as string

    if (!startDate || !endDate) {
      return { content: "startDate and endDate are required", isError: true }
    }

    const orders = await fetchAllOrders({ startDate, endDate, status: "paid" })

    const totalRevenue = orders.reduce((sum, o) => sum + (o.amount ?? 0), 0)
    const orderCount = orders.length
    const averageTicket = orderCount > 0 ? totalRevenue / orderCount : 0

    const productMap = new Map<string, { revenue: number; count: number }>()
    for (const order of orders) {
      const name = order.product.name
      const existing = productMap.get(name) ?? { revenue: 0, count: 0 }
      productMap.set(name, {
        revenue: existing.revenue + (order.amount ?? 0),
        count: existing.count + 1,
      })
    }

    const paymentMap = new Map<string, { revenue: number; count: number }>()
    for (const order of orders) {
      const method = order.paymentMethod
      const existing = paymentMap.get(method) ?? { revenue: 0, count: 0 }
      paymentMap.set(method, {
        revenue: existing.revenue + (order.amount ?? 0),
        count: existing.count + 1,
      })
    }

    const summary = {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      orderCount,
      averageTicket: Math.round(averageTicket * 100) / 100,
      byProduct: [...productMap.entries()]
        .map(([name, data]) => ({ name, revenue: Math.round(data.revenue * 100) / 100, count: data.count }))
        .sort((a, b) => b.revenue - a.revenue),
      byPaymentMethod: [...paymentMap.entries()]
        .map(([method, data]) => ({ method, revenue: Math.round(data.revenue * 100) / 100, count: data.count }))
        .sort((a, b) => b.revenue - a.revenue),
      period: { start: startDate, end: endDate },
    }

    return { content: JSON.stringify(summary) }
  } catch (error) {
    return { content: `Failed to generate revenue summary: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

export const executeFinanceTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    getOrders,
    getProducts,
    getRevenueSummary,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown finance tool: ${toolName}`, isError: true }

  return handler(input)
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/server/src/tools/finance.ts
git commit -m "feat: add Finance agent tools (getOrders, getProducts, getRevenueSummary)"
```

---

### Task 6: Route Finance tools in tool executor

**Files:**
- Modify: `apps/server/src/runtime/tool-executor.ts`

- [ ] **Step 1: Add Finance tool routing**

Replace the entire file `apps/server/src/runtime/tool-executor.ts`:

```typescript
import type { ToolDefinition } from "@ozap-office/shared"
import { executeLeaderTool } from "../tools/leader.js"
import { executeFinanceTool } from "../tools/finance.js"

type ToolResult = {
  content: string
  isError?: boolean
}

const LEADER_TOOLS = ["askAgent", "getAgentHistory", "delegateTask"]
const FINANCE_TOOLS = ["getOrders", "getProducts", "getRevenueSummary"]

export const executeTool = async (
  agentId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  availableTools: ToolDefinition[]
): Promise<ToolResult> => {
  try {
    if (LEADER_TOOLS.includes(toolName)) {
      return executeLeaderTool(toolName, toolInput)
    }

    if (FINANCE_TOOLS.includes(toolName)) {
      return executeFinanceTool(toolName, toolInput)
    }

    return { content: `Unknown tool: ${toolName}`, isError: true }
  } catch (error) {
    return {
      content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/server/src/runtime/tool-executor.ts
git commit -m "feat: route Finance agent tools in tool executor"
```

---

## Chunk 3: Backend Wiring (Seed + Executor + Scheduler + Route)

### Task 7: Update seed with upsert pattern and Finance agent config

**Files:**
- Modify: `apps/server/src/db/seed.ts`

- [ ] **Step 1: Rewrite seed with upsert and Finance agent tools/schedule/prompt**

Replace the entire file `apps/server/src/db/seed.ts`:

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/server/src/db/seed.ts
git commit -m "feat: upsert seed pattern with Finance agent tools, schedule, and cronPrompt"
```

---

### Task 8: Update executor to set `has_report` on cron completion

**Files:**
- Modify: `apps/server/src/runtime/executor.ts`

- [ ] **Step 1: Change `executeAgent` to accept trigger-based final status**

In `apps/server/src/runtime/executor.ts`, change line 93:

```typescript
// FROM (line 93):
  await updateAgentStatus(agentId, "idle")

// TO:
  const finalStatus = trigger === "cron" ? "has_report" : "idle"
  await updateAgentStatus(agentId, finalStatus)
```

This is the only change needed. The `executeAgent` function already receives `trigger` as a parameter (line 53).

- [ ] **Step 2: Typecheck**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/server/src/runtime/executor.ts
git commit -m "feat: set has_report status after cron execution"
```

---

### Task 9: Update scheduler to pass cronPrompt as inputContext

**Files:**
- Modify: `apps/server/src/scheduler/index.ts`

- [ ] **Step 1: Pass cronPrompt to executeAgent**

Replace the entire file `apps/server/src/scheduler/index.ts`:

```typescript
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
```

The only change is line 21: `agent.cronPrompt ?? undefined` passed as third argument to `executeAgent`.

- [ ] **Step 2: Typecheck**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/server/src/scheduler/index.ts
git commit -m "feat: pass cronPrompt as inputContext in scheduler"
```

---

### Task 10: Add `POST /api/agents/:id/read` endpoint

**Files:**
- Modify: `apps/server/src/routes/agents.ts`

- [ ] **Step 1: Add read endpoint to reset agent status**

In `apps/server/src/routes/agents.ts`, add before the closing `}` of `registerAgentRoutes` (before line 44):

```typescript
  server.post<{ Params: { id: string } }>("/api/agents/:id/read", async (request, reply) => {
    const [agent] = await db.select().from(agents).where(eq(agents.id, request.params.id))
    if (!agent) return reply.code(404).send({ error: "Agent not found" })

    if (agent.status === "has_report") {
      await db.update(agents).set({ status: "idle", updatedAt: new Date() }).where(eq(agents.id, agent.id))
    }

    return { status: "ok" }
  })
```

Also add the import for `eventBus` at the top of the file. Actually — looking at the code, the status update via DB is sufficient because the frontend already polls/receives status via WebSocket from the `updateAgentStatus` function in executor. But for this endpoint, we need to also emit the status change. Let me include that.

Updated approach — add after the existing imports (line 5):

```typescript
import { eventBus } from "../events/event-bus.js"
```

And the endpoint body becomes:

```typescript
  server.post<{ Params: { id: string } }>("/api/agents/:id/read", async (request, reply) => {
    const [agent] = await db.select().from(agents).where(eq(agents.id, request.params.id))
    if (!agent) return reply.code(404).send({ error: "Agent not found" })

    if (agent.status === "has_report") {
      await db.update(agents).set({ status: "idle", updatedAt: new Date() }).where(eq(agents.id, agent.id))
      eventBus.emit("agentStatus", { agentId: agent.id, status: "idle" })
    }

    return { status: "ok" }
  })
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/server/src/routes/agents.ts
git commit -m "feat: add POST /api/agents/:id/read endpoint for badge dismissal"
```

---

## Chunk 4: Frontend (API Client + Badge + Read Receipt)

### Task 11: Add `markAgentRead` to API client

**Files:**
- Modify: `apps/web/lib/api-client.ts`

- [ ] **Step 1: Add markAgentRead function**

In `apps/web/lib/api-client.ts`, add after `sendMeetingMessage` (line 37, before the closing `}`):

```typescript
  markAgentRead: (id: string) =>
    request<{ status: string }>(`/api/agents/${id}/read`, { method: "POST" }),
```

- [ ] **Step 2: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/web/lib/api-client.ts
git commit -m "feat: add markAgentRead to API client"
```

---

### Task 12: Add has_report badge rendering to sprite manager

**Files:**
- Modify: `apps/web/lib/canvas/sprite-manager.ts`

- [ ] **Step 1: Add has_report to STATUS_COLORS and STATUS_LABELS**

In `apps/web/lib/canvas/sprite-manager.ts`, update the two lookup tables:

Change lines 4-11 (STATUS_COLORS):
```typescript
const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#888888",
  working: "#50fa7b",
  thinking: "#f1fa8c",
  waiting: "#ffb86c",
  meeting: "#bd93f9",
  error: "#ff5555",
  has_report: "#ffb86c",
}
```

Change lines 13-20 (STATUS_LABELS):
```typescript
const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: "zzz",
  working: "...",
  thinking: "?",
  waiting: "!",
  meeting: ">>",
  error: "X",
  has_report: "NEW",
}
```

- [ ] **Step 2: Add pulsating badge in drawAgent**

In `apps/web/lib/canvas/sprite-manager.ts`, modify the `drawAgent` function (lines 627-644). Add the pulsating badge after the existing rendering:

```typescript
export const drawAgent = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  color: string,
  name: string,
  status: AgentStatus,
  seated: boolean = false,
  room: string | null = null
) => {
  if (seated) {
    drawSeatedCharacter(ctx, screenX, screenY, color, room)
  } else {
    drawCharacterBody(ctx, screenX, screenY, color)
  }
  drawStatusBubble(ctx, screenX, screenY, status)
  drawNameLabel(ctx, screenX, screenY, name, status, color)

  if (status === "has_report") {
    const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7
    const dotX = screenX + CANVAS_CONFIG.tileSize / 2 - 3
    const dotY = screenY - 4
    ctx.globalAlpha = pulse
    rect(ctx, dotX, dotY, 6, 6, "#ffb86c")
    rect(ctx, dotX + 1, dotY + 1, 4, 4, "#ffd090")
    ctx.globalAlpha = 1
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/web build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/web/lib/canvas/sprite-manager.ts
git commit -m "feat: add has_report badge with pulsating dot to sprite manager"
```

---

### Task 13: Add read receipt to thought panel

**Files:**
- Modify: `apps/web/lib/components/thought-panel.tsx`

- [ ] **Step 1: Call markAgentRead when opening panel for agent with has_report**

In `apps/web/lib/components/thought-panel.tsx`, add a `useEffect` that calls `markAgentRead` when the selected agent has `has_report` status. Add after the existing `useEffect` (after line 46):

```typescript
  useEffect(() => {
    if (selectedAgent?.status === "has_report" && selectedAgentId) {
      api.markAgentRead(selectedAgentId).catch(console.error)
    }
  }, [selectedAgentId, selectedAgent?.status])
```

The `selectedAgent` is already derived on line 40: `const selectedAgent = agents.find((a) => a.id === selectedAgentId)`. The `api` is already imported on line 5. No new imports needed.

- [ ] **Step 2: Build frontend**

Run: `cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/web build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git add apps/web/lib/components/thought-panel.tsx
git commit -m "feat: auto-dismiss has_report badge when opening thought panel"
```

---

## Deployment

After all tasks are complete:

### Task 14: Build, deploy, and run seed

- [ ] **Step 1: Build server and web**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
pnpm -F @ozap-office/shared build
pnpm -F @ozap-office/server build
NEXT_PUBLIC_API_URL= NEXT_PUBLIC_WS_URL= NEXT_PUBLIC_API_KEY=ozap-office-key-2026 pnpm -F @ozap-office/web build
```

- [ ] **Step 2: Push to GitHub**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
git push origin main
```

- [ ] **Step 3: Deploy to EC2 via SSM**

```bash
AWS_PROFILE=ozapgpt aws ssm send-command \
  --instance-ids i-025ac97362e218181 \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["export PATH=/root/.local/share/pnpm:/root/.local/share/pnpm/global/5/node_modules/.bin:/root/.local/share/pnpm/nodejs/20.20.1/bin:$PATH","cd /opt/ozap-office && git pull && pnpm -F @ozap-office/shared build && pnpm -F @ozap-office/server build && NEXT_PUBLIC_API_URL= NEXT_PUBLIC_WS_URL= NEXT_PUBLIC_API_KEY=ozap-office-key-2026 pnpm -F @ozap-office/web build && pnpm -F @ozap-office/server db:generate && pnpm -F @ozap-office/server db:migrate && pnpm -F @ozap-office/server db:seed && pm2 restart all"]}' \
  --timeout-seconds 180 \
  --query 'Command.CommandId' --output text --region us-east-1
```

- [ ] **Step 4: Add Cakto credentials to EC2 .env**

SSH or SSM into EC2 and add to `/opt/ozap-office/.env`:
```
CAKTO_CLIENT_ID=<your-client-id>
CAKTO_CLIENT_SECRET=<your-client-secret>
```

Then restart: `pm2 restart all`

- [ ] **Step 5: Verify — test Finance agent chat**

Open http://13.219.31.27, click on Finance agent, send a message like "Quais produtos estão ativos?" and verify the agent uses the `getProducts` tool and responds.
