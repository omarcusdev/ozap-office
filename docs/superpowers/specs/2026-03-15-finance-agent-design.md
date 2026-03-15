# Finance Agent — Cakto Integration Design

**Goal:** Functionalize the Finance agent with read-only tools that query the Cakto payment gateway API, enabling on-demand financial queries via chat and automated weekly reports.

**Architecture:** Direct API calls to Cakto (no local cache). OAuth2 token managed in-memory with proactive renewal. Three tools give the agent access to orders, products, and revenue summaries. Weekly cron generates a report every Sunday at 9am.

**Tech Stack:** Cakto REST API, OAuth2, node-cron (already in project), existing Bedrock agentic loop.

---

## 1. Cakto Client

**File:** `apps/server/src/integrations/cakto-client.ts`

New directory `integrations/` — separates external API clients from agent tool handlers in `tools/`. This keeps `tools/` focused on Bedrock tool definitions and dispatch logic, while `integrations/` holds reusable API clients that tools consume.

### Authentication

- OAuth2 via `POST https://api.cakto.com.br/public_api/token/`
- Credentials: `CAKTO_CLIENT_ID` + `CAKTO_CLIENT_SECRET` from `.env` via `config.ts`
- Token cached in-memory with expiration timestamp
- Proactive renewal when token has < 5 minutes remaining
- On 401 response: force token refresh and retry once

### Exported Functions

```typescript
fetchOrders(filters: OrderFilters): Promise<PaginatedResponse<CaktoOrder>>
fetchProducts(filters: ProductFilters): Promise<PaginatedResponse<CaktoProduct>>
fetchOrderById(orderId: string): Promise<CaktoOrder>
fetchAllOrders(filters: OrderFilters): Promise<CaktoOrder[]>  // paginate until done, max 500
```

### Types

```typescript
type OrderFilters = {
  startDate?: string    // ISO 8601
  endDate?: string      // ISO 8601
  status?: string       // comma-separated: "paid", "refunded", etc.
  productId?: string
  limit?: number        // default 50
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
```

### Error Handling

- Network errors: return descriptive message, agent informs user data is unavailable
- 401: refresh token, retry once
- 4xx/5xx: return error with status code and message

### Configuration

Add to `apps/server/src/config.ts` using the existing `requireEnv()` pattern:

```env
CAKTO_CLIENT_ID=xxx
CAKTO_CLIENT_SECRET=xxx
```

These are optional env vars — the server starts without them, but Finance agent tools return an error if credentials are missing.

---

## 2. Finance Agent Tools

**File:** `apps/server/src/tools/finance.ts`

Three tools registered in the Finance agent's tools array.

### 2.1 `getOrders`

Query orders from Cakto with filters.

- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "startDate": { "type": "string", "description": "Start date ISO 8601 (e.g. 2026-03-01)" },
      "endDate": { "type": "string", "description": "End date ISO 8601 (e.g. 2026-03-15)" },
      "status": { "type": "string", "description": "Order status filter: paid, refunded, canceled, processing, etc." },
      "productId": { "type": "string", "description": "Filter by product ID" },
      "limit": { "type": "number", "description": "Max results (default 20)" }
    }
  }
  ```
- **Behavior:** Calls `fetchOrders()`, returns array of orders with relevant fields (id, status, amount, product name, customer name, paidAt, paymentMethod)
- **Agent interprets** the raw data and responds in natural language

### 2.2 `getProducts`

List products from Cakto.

- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "status": { "type": "string", "description": "Filter: active, blocked, deleted" },
      "search": { "type": "string", "description": "Search by product name" },
      "limit": { "type": "number", "description": "Max results (default 20)" }
    }
  }
  ```
- **Behavior:** Calls `fetchProducts()`, returns array of products (id, name, price, type, status, category)

### 2.3 `getRevenueSummary`

Aggregated financial summary for a date range.

- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "startDate": { "type": "string", "description": "Start date ISO 8601" },
      "endDate": { "type": "string", "description": "End date ISO 8601" }
    },
    "required": ["startDate", "endDate"]
  }
  ```
- **Behavior:**
  1. Calls `fetchAllOrders({ startDate, endDate, status: "paid" })` — paginates through all results, capped at 500 orders to prevent memory/performance issues
  2. Computes: total revenue, order count, average ticket, breakdown by product, breakdown by payment method
  3. Returns structured summary for the agent to format

- **Return type:**
  ```typescript
  type RevenueSummary = {
    totalRevenue: number
    orderCount: number
    averageTicket: number
    byProduct: Array<{ name: string; revenue: number; count: number }>
    byPaymentMethod: Array<{ method: string; revenue: number; count: number }>
    period: { start: string; end: string }
  }
  ```

### Tool Registration

Update `apps/server/src/db/seed.ts` to include these 3 tools in the Finance agent's `tools` array with complete `inputSchema` definitions. The seed must use an **upsert pattern** (see Section 6).

### Tool Dispatch

Update `apps/server/src/runtime/tool-executor.ts` to route Finance agent tool calls to handlers in `apps/server/src/tools/finance.ts`.

---

## 3. Cron & Weekly Report

### Schedule

- **Cron expression:** `0 9 * * 0` (Sunday at 9am)
- Set in Finance agent's `schedule` field in seed data

### Cron Prompt

New field `cronPrompt` in agents table (text, nullable). For Finance:

```
Gere o relatório semanal de vendas dos últimos 7 dias.
Inclua: receita total, quantidade de vendas, ticket médio,
top 3 produtos, breakdown por método de pagamento,
e compare com a semana anterior.
```

### Execution Flow

1. `scheduler/index.ts` queries agents with `schedule IS NOT NULL`, which now includes `cronPrompt`
2. Scheduler calls `executeAgent(agent.id, "cron", agent.cronPrompt)` — passing the `cronPrompt` as `inputContext`
3. Agent uses its tools to gather data
4. Agent generates formatted report
5. Report saved as events in DB, visible in thought panel
6. In `executor.ts`, after the agentic loop completes: if `trigger === "cron"`, set agent status to `"has_report"` instead of `"idle"`

### Schema Change

- Add `cronPrompt` column to `agents` table: `text("cron_prompt")`
- Run Drizzle migration: `pnpm -F shared db:generate && pnpm -F shared db:migrate`
- Update `AgentConfig` type in `packages/shared/src/types.ts` to include `cronPrompt: string | null`

---

## 4. Visual Notification (Badge)

### New Agent Status

Add `"has_report"` to the `AgentStatus` TypeScript union type in `packages/shared/src/types.ts`. No Postgres enum change needed — the `status` column in `schema.ts` is `text`, not a Postgres enum.

### Badge Rendering

In `apps/web/lib/canvas/sprite-manager.ts`:
- Add `"has_report"` entry to `STATUS_COLORS` table (orange: `#ffb86c`)
- Add `"has_report"` entry to `STATUS_LABELS` table (label: `"report"`)
- Additionally, draw a small pulsating dot above the agent's head when status is `"has_report"` — this is rendered **in addition to** the normal status bubble, not as a replacement. Pulsation via opacity oscillation using `Math.sin(Date.now() / 300)`

### Read Receipt

- When user clicks an agent with `"has_report"` status and the thought panel opens:
  - Frontend calls `POST /api/agents/:id/read`
  - Backend sets agent status back to `"idle"`
  - Status change broadcasts via WebSocket

**Files affected:**
- `apps/server/src/routes/agents.ts` — new `POST /api/agents/:id/read` endpoint
- `apps/web/lib/components/thought-panel.tsx` — call read endpoint when opening panel for agent with `"has_report"`
- `apps/web/lib/api-client.ts` — add `markAgentRead(id)` function

### Trigger Condition

Only `"cron"` trigger sets `"has_report"`. Manual chat interactions follow normal flow (`"working"` → `"idle"`).

---

## 5. System Prompt

Update Finance agent's `systemPrompt` in seed data:

```
Você é o Finance, controlador financeiro da equipe. Sua fonte de dados é a plataforma Cakto (gateway de pagamentos).

Suas responsabilidades:
- Responder perguntas sobre vendas, receita, produtos e transações
- Gerar relatórios financeiros quando solicitado
- Identificar tendências e anomalias nos dados de vendas

Regras:
- Sempre apresente valores em BRL (R$)
- Use formatação clara com números arredondados (2 casas decimais)
- Quando comparar períodos, calcule variação percentual
- Se a API retornar erro, informe que os dados estão temporariamente indisponíveis
- Nunca invente dados — use apenas o que as tools retornarem
```

---

## 6. Seed Upsert Strategy

The current seed in `seed.ts` uses a **skip-if-exists** pattern — it checks if agents exist and skips insertion. This means re-running the seed will NOT update existing agents with new tools, schedule, cronPrompt, or systemPrompt.

**Fix:** Change seed to an **upsert pattern** using Drizzle's `onConflictDoUpdate`:

```typescript
// For each agent: insert or update on conflict (name)
db.insert(agents).values(agentData).onConflictDoUpdate({
  target: agents.name,
  set: { tools, schedule, cronPrompt, systemPrompt, updatedAt: new Date() }
})
```

This ensures that re-running the seed always applies the latest configuration without deleting existing agent data (id, position, status are preserved).

---

## File Summary

| Action | File |
|--------|------|
| Create | `apps/server/src/integrations/cakto-client.ts` — Cakto API client with OAuth2 token management |
| Create | `apps/server/src/tools/finance.ts` — Finance tool handlers (getOrders, getProducts, getRevenueSummary) |
| Modify | `packages/shared/src/types.ts` — add `"has_report"` to AgentStatus, add `cronPrompt: string \| null` to AgentConfig |
| Modify | `apps/server/src/config.ts` — add optional `CAKTO_CLIENT_ID` and `CAKTO_CLIENT_SECRET` env vars |
| Modify | `apps/server/src/db/schema.ts` — add `cronPrompt` text column to agents table |
| Modify | `apps/server/src/db/seed.ts` — upsert pattern, Finance tools/schedule/cronPrompt/systemPrompt |
| Modify | `apps/server/src/runtime/tool-executor.ts` — route Finance tool calls |
| Modify | `apps/server/src/runtime/executor.ts` — set `"has_report"` status when `trigger === "cron"` (instead of `"idle"`) |
| Modify | `apps/server/src/scheduler/index.ts` — pass `cronPrompt` as `inputContext` to `executeAgent` |
| Modify | `apps/server/src/routes/agents.ts` — add `POST /api/agents/:id/read` endpoint |
| Modify | `apps/web/lib/canvas/sprite-manager.ts` — add `STATUS_COLORS`/`STATUS_LABELS` entries for `"has_report"`, pulsating badge |
| Modify | `apps/web/lib/components/thought-panel.tsx` — call read endpoint on panel open for `"has_report"` agents |
| Modify | `apps/web/lib/api-client.ts` — add `markAgentRead()` function |
| Migration | Run `pnpm -F shared db:generate && pnpm -F shared db:migrate` after schema change |

## Out of Scope

- Instagram Agent (deferred — no API credentials)
- Meeting room chat
- Approval flow (Finance tools are read-only)
- Local data caching/sync
- Other agents (Sales, Ads, PM)
