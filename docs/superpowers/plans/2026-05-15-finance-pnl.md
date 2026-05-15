# Finance P&L Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only P&L panel that opens with Finance agent in the office canvas, sourced from a single `ledger_entries` table populated by a daily revenue cron (Cakto + AbacatePay) and a manual cost seed (Pedro salary, OpenAI, AWS).

**Architecture:** New Postgres table `ledger_entries` stores per-transaction revenue and cost rows in BRL cents. A daily cron upserts revenue from Cakto + AbacatePay (idempotent via `(source, external_id)` unique). Cost rows are seeded from a TS file run via `pnpm db:seed`. Fastify route `GET /api/pnl` aggregates by `SUM GROUP BY` and returns a `PnlSummary` JSON consumed by a 450px React panel rendered inside `ThoughtPanel` when the Finance agent is selected.

**Tech Stack:** Drizzle ORM, Postgres, Fastify, node-cron, Next.js 15 + React 19, TanStack Query, Tailwind v4 (theme tokens in `apps/web/app/globals.css`).

**Spec:** `docs/superpowers/specs/2026-05-15-finance-pnl-design.md`

**Test policy:** No automated tests for this feature (per spec non-goals). Each task ends with `pnpm typecheck` (or a verification command) and a commit. Manual smoke verification listed in Task 13.

---

## File Structure

**Backend (`apps/server/src/`):**

| File | Responsibility |
|------|---------------|
| `db/schema.ts` (modify) | Add `ledgerEntries` Drizzle table |
| `db/seed/costs.ts` (new) | Static `manualCosts` array + `seedCosts(db)` upsert function |
| `db/seed.ts` (modify) | Import + call `seedCosts` after agent seeding |
| `pnl/fx.ts` (new) | `usdToBrl(cents): number` — env-driven FX, throws if env unset |
| `pnl/aggregator.ts` (new) | `aggregateMonth(db, month): Promise<PnlSummary>` |
| `routes/pnl.ts` (new) | `GET /api/pnl?month=YYYY-MM` handler |
| `index.ts` (modify) | Register `registerPnlRoutes(server)` |
| `integrations/abacatepay-client.ts` (modify) | Add `fetchAllBillings(since)` |
| `ingestion/revenue-sync.ts` (new) | `syncRevenue()` — Cakto + AbacatePay upsert |
| `scripts/sync-revenue.ts` (new) | Manual CLI wrapper around `syncRevenue()` |
| `scheduler/index.ts` (modify) | Register `cron.schedule('0 9 * * *', syncRevenue)` |

**Shared (`packages/shared/src/`):**

| File | Responsibility |
|------|---------------|
| `types.ts` (modify) | Export `PnlSummary` type |

**Frontend (`apps/web/lib/`):**

| File | Responsibility |
|------|---------------|
| `api-client.ts` (modify) | Add `fetchPnl(month)` method |
| `queries/pnl-queries.ts` (new) | `usePnl(month)` TanStack Query hook |
| `components/finance-panel.tsx` (new) | KPI cards + categorized rows, 450px wide |
| `components/thought-panel.tsx` (modify) | Embed `<FinancePanel>` when selected agent is "Finance" |

---

## Task 1: Backend — Add `ledger_entries` schema + migration

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Generate: `apps/server/drizzle/00XX_*.sql` (drizzle-kit picks name)

- [ ] **Step 1: Add `ledgerEntries` table to schema**

Append to `apps/server/src/db/schema.ts`:

```ts
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    amountBrlCents: integer("amount_brl_cents").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    externalId: text("external_id").notNull(),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ledger_entries_kind_date_idx").on(table.kind, table.occurredAt),
    index("ledger_entries_source_extid_unique").on(table.source, table.externalId),
  ]
)
```

Note: drizzle `index` is non-unique by default. The `(source, external_id)` uniqueness will be added via SQL in step 3.

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
```

Expected: new file `apps/server/drizzle/00XX_<name>.sql` containing `CREATE TABLE "ledger_entries" ...` plus two indexes.

- [ ] **Step 3: Edit migration to add unique constraint and CHECK constraints**

Open the generated migration file and append the following SQL at the bottom:

```sql
DROP INDEX IF EXISTS "ledger_entries_source_extid_unique";
CREATE UNIQUE INDEX "ledger_entries_source_extid_unique" ON "ledger_entries" ("source","external_id");
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_kind_check" CHECK (kind IN ('revenue','cost'));
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_currency_check" CHECK (currency IN ('BRL','USD'));
```

- [ ] **Step 4: Apply migration locally**

```bash
pnpm db:migrate
```

Expected: migration runs, table exists. Verify with:

```bash
psql "$DATABASE_URL" -c "\d ledger_entries"
```

Expected output shows the table with the constraints and unique index.

- [ ] **Step 5: Typecheck**

```bash
pnpm -F @ozap-office/server typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/
git commit -m "feat(db): add ledger_entries table for P&L tracking"
```

---

## Task 2: Shared — Add `PnlSummary` type

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Append type to `packages/shared/src/types.ts`**

```ts
export type PnlCategoryRow = {
  category: string
  source: string
  amountBrlCents: number
}

export type PnlSummary = {
  month: string
  kpis: {
    revenueBrlCents: number
    costBrlCents: number
    profitBrlCents: number
  }
  revenueByCategory: PnlCategoryRow[]
  costByCategory: PnlCategoryRow[]
}
```

- [ ] **Step 2: Build shared package**

```bash
pnpm -F @ozap-office/shared build
```

Expected: build succeeds, `packages/shared/dist/` is updated.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/dist
git commit -m "feat(shared): add PnlSummary type"
```

---

## Task 3: Backend — FX helper

**Files:**
- Create: `apps/server/src/pnl/fx.ts`

- [ ] **Step 1: Write `apps/server/src/pnl/fx.ts`**

```ts
export const usdToBrl = (amountUsdCents: number): number => {
  const raw = process.env.USD_TO_BRL
  if (!raw) throw new Error("USD_TO_BRL env var required for USD entries")
  const rate = Number(raw)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`USD_TO_BRL invalid: ${raw}`)
  }
  return Math.round(amountUsdCents * rate)
}

export const toBrlCents = (amountCents: number, currency: "BRL" | "USD"): number =>
  currency === "BRL" ? amountCents : usdToBrl(amountCents)
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F @ozap-office/server typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/pnl/fx.ts
git commit -m "feat(pnl): add USD→BRL FX helper"
```

---

## Task 4: Backend — Aggregator

**Files:**
- Create: `apps/server/src/pnl/aggregator.ts`

- [ ] **Step 1: Write `apps/server/src/pnl/aggregator.ts`**

```ts
import { sql } from "drizzle-orm"
import { db } from "../db/client.js"
import { ledgerEntries } from "../db/schema.js"
import type { PnlSummary, PnlCategoryRow } from "@ozap-office/shared"

type Row = {
  kind: "revenue" | "cost"
  category: string
  source: string
  total: string
}

const monthBounds = (month: string): { start: string; end: string } => {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) throw new Error(`Invalid month, expected YYYY-MM, got: ${month}`)
  const year = Number(match[1])
  const monthIndex = Number(match[2])
  if (monthIndex < 1 || monthIndex > 12) {
    throw new Error(`Invalid month number: ${monthIndex}`)
  }
  const start = `${year}-${String(monthIndex).padStart(2, "0")}-01`
  const nextYear = monthIndex === 12 ? year + 1 : year
  const nextMonth = monthIndex === 12 ? 1 : monthIndex + 1
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  return { start, end }
}

export const aggregateMonth = async (month: string): Promise<PnlSummary> => {
  const { start, end } = monthBounds(month)

  const rows = await db.execute<Row>(sql`
    SELECT kind,
           category,
           source,
           SUM(amount_brl_cents)::bigint::text AS total
    FROM ${ledgerEntries}
    WHERE occurred_at >= ${start}
      AND occurred_at < ${end}
    GROUP BY kind, category, source
    ORDER BY kind, total DESC
  `)

  const revenueByCategory: PnlCategoryRow[] = []
  const costByCategory: PnlCategoryRow[] = []
  let revenueBrlCents = 0
  let costBrlCents = 0

  for (const row of rows.rows as Row[]) {
    const amount = Number(row.total)
    const entry: PnlCategoryRow = {
      category: row.category,
      source: row.source,
      amountBrlCents: amount,
    }
    if (row.kind === "revenue") {
      revenueByCategory.push(entry)
      revenueBrlCents += amount
    } else if (row.kind === "cost") {
      costByCategory.push(entry)
      costBrlCents += amount
    }
  }

  return {
    month,
    kpis: {
      revenueBrlCents,
      costBrlCents,
      profitBrlCents: revenueBrlCents - costBrlCents,
    },
    revenueByCategory,
    costByCategory,
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F @ozap-office/server typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/pnl/aggregator.ts
git commit -m "feat(pnl): add monthly P&L aggregator"
```

---

## Task 5: Backend — Route + register

**Files:**
- Create: `apps/server/src/routes/pnl.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Write `apps/server/src/routes/pnl.ts`**

```ts
import type { FastifyInstance } from "fastify"
import { aggregateMonth } from "../pnl/aggregator.js"

const currentMonth = (): string => {
  const now = new Date()
  const tzOffset = -3 * 60
  const local = new Date(now.getTime() + (tzOffset - now.getTimezoneOffset()) * 60_000)
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`
}

export const registerPnlRoutes = (server: FastifyInstance) => {
  server.get<{ Querystring: { month?: string } }>("/api/pnl", async (request, reply) => {
    const month = request.query.month ?? currentMonth()
    try {
      const summary = await aggregateMonth(month)
      return summary
    } catch (error) {
      reply.code(400)
      return { error: error instanceof Error ? error.message : "Invalid month" }
    }
  })
}
```

- [ ] **Step 2: Register route in `apps/server/src/index.ts`**

After the `import { registerTrackingRoutes } from "./routes/tracking.js"` line, add:

```ts
import { registerPnlRoutes } from "./routes/pnl.js"
```

After `registerMeetingRoutes(server)`, add:

```ts
  registerPnlRoutes(server)
```

- [ ] **Step 3: Typecheck**

```bash
pnpm -F @ozap-office/server typecheck
```

Expected: passes.

- [ ] **Step 4: Smoke test route locally**

Start the server (`pnpm dev:server` if not already running), then:

```bash
curl -s -H "x-api-key: $OZAP_OFFICE_API_KEY" "http://localhost:3001/api/pnl?month=2026-05" | jq
```

Expected: JSON `{month, kpis, revenueByCategory, costByCategory}` with all zero/empty (no rows yet).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/pnl.ts apps/server/src/index.ts
git commit -m "feat(api): GET /api/pnl returns monthly P&L summary"
```

---

## Task 6: Backend — Extend AbacatePay client to list billings

**Files:**
- Modify: `apps/server/src/integrations/abacatepay-client.ts`

- [ ] **Step 1: Add export at end of `abacatepay-client.ts`**

```ts
export type AbacatepayBillingRecord = {
  id: string
  amount: number
  paidAmount: number
  status: string
  frequency: string
  createdAt: string
  updatedAt: string
}

export const fetchAllBillings = async (): Promise<AbacatepayBillingRecord[]> => {
  assertApiKey()

  const response = await fetch(`${ABACATEPAY_BASE_URL}/billing/list`, {
    headers: abacatepayHeaders(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`AbacatePay API error (${response.status}): ${text}`)
  }

  const body = (await response.json()) as { data: AbacatepayBillingRecord[] }
  return body.data
}
```

Then replace the existing private `type AbacatepayBilling = { ... }` declaration (lines ~5-13) and the reference `body.data as { data: AbacatepayBilling[] }` inside `fetchBillingPaidAmount` (~line 38) with the exported `AbacatepayBillingRecord` type. Concretely, delete the old `type AbacatepayBilling = {...}` block, and inside `fetchBillingPaidAmount` change `{ data: AbacatepayBilling[] }` → `{ data: AbacatepayBillingRecord[] }`.

- [ ] **Step 2: Typecheck**

```bash
pnpm -F @ozap-office/server typecheck
```

Expected: passes (rename should not break other consumers — verify with grep).

```bash
grep -rn "AbacatepayBilling" apps/server/src
```

Expected: only references inside `abacatepay-client.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/integrations/abacatepay-client.ts
git commit -m "feat(abacatepay): add fetchAllBillings"
```

---

## Task 7: Backend — Revenue sync function

**Files:**
- Create: `apps/server/src/ingestion/revenue-sync.ts`

- [ ] **Step 1: Write `apps/server/src/ingestion/revenue-sync.ts`**

```ts
import { sql } from "drizzle-orm"
import { db } from "../db/client.js"
import { ledgerEntries } from "../db/schema.js"
import { fetchAllOrders } from "../integrations/cakto-client.js"
import { fetchAllBillings } from "../integrations/abacatepay-client.js"

type SyncResult = { source: string; inserted: number; skipped: number; error?: string }

const watermark = async (source: string): Promise<string> => {
  const result = await db.execute<{ max: string | null }>(sql`
    SELECT MAX(occurred_at)::text AS max FROM ${ledgerEntries} WHERE source = ${source}
  `)
  const max = (result.rows[0] as { max: string | null } | undefined)?.max
  if (max) return max
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setUTCDate(sixtyDaysAgo.getUTCDate() - 60)
  return sixtyDaysAgo.toISOString()
}

const upsertEntry = async (entry: {
  kind: "revenue" | "cost"
  source: string
  category: string
  amountCents: number
  currency: "BRL" | "USD"
  amountBrlCents: number
  occurredAt: string
  externalId: string
  rawJson: unknown
}): Promise<boolean> => {
  const result = await db.execute(sql`
    INSERT INTO ${ledgerEntries}
      (kind, source, category, amount_cents, currency, amount_brl_cents, occurred_at, external_id, raw_json)
    VALUES
      (${entry.kind}, ${entry.source}, ${entry.category}, ${entry.amountCents},
       ${entry.currency}, ${entry.amountBrlCents}, ${entry.occurredAt},
       ${entry.externalId}, ${JSON.stringify(entry.rawJson)}::jsonb)
    ON CONFLICT (source, external_id) DO NOTHING
    RETURNING id
  `)
  return result.rows.length > 0
}

const syncCakto = async (): Promise<SyncResult> => {
  try {
    const since = await watermark("cakto")
    const orders = await fetchAllOrders({
      paidStartDate: since.slice(0, 10),
      status: "paid",
    })
    let inserted = 0
    let skipped = 0
    for (const order of orders) {
      if (!order.paidAt || order.amount === null) {
        skipped++
        continue
      }
      const did = await upsertEntry({
        kind: "revenue",
        source: "cakto",
        category: "card_payment",
        amountCents: Math.round(order.amount * 100),
        currency: "BRL",
        amountBrlCents: Math.round(order.amount * 100),
        occurredAt: order.paidAt,
        externalId: order.id,
        rawJson: order,
      })
      if (did) inserted++
      else skipped++
    }
    return { source: "cakto", inserted, skipped }
  } catch (err) {
    return { source: "cakto", inserted: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

const syncAbacatePay = async (): Promise<SyncResult> => {
  try {
    const billings = await fetchAllBillings()
    let inserted = 0
    let skipped = 0
    for (const billing of billings) {
      if (billing.status !== "PAID" || billing.paidAmount <= 0) {
        skipped++
        continue
      }
      const did = await upsertEntry({
        kind: "revenue",
        source: "abacatepay",
        category: "pix",
        amountCents: billing.paidAmount,
        currency: "BRL",
        amountBrlCents: billing.paidAmount,
        occurredAt: billing.updatedAt,
        externalId: billing.id,
        rawJson: billing,
      })
      if (did) inserted++
      else skipped++
    }
    return { source: "abacatepay", inserted, skipped }
  } catch (err) {
    return { source: "abacatepay", inserted: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

export const syncRevenue = async (): Promise<SyncResult[]> => {
  const [cakto, abacate] = await Promise.all([syncCakto(), syncAbacatePay()])
  console.log("[revenue-sync]", JSON.stringify([cakto, abacate]))
  return [cakto, abacate]
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F @ozap-office/server typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/ingestion/revenue-sync.ts
git commit -m "feat(ingestion): revenue sync from Cakto + AbacatePay"
```

---

## Task 8: Backend — Manual sync CLI

**Files:**
- Create: `apps/server/scripts/sync-revenue.ts`

- [ ] **Step 1: Write `apps/server/scripts/sync-revenue.ts`**

```ts
import "dotenv/config"
import { syncRevenue } from "../src/ingestion/revenue-sync.js"

const main = async () => {
  const results = await syncRevenue()
  console.log("Sync results:")
  for (const r of results) {
    console.log(`  ${r.source}: inserted=${r.inserted} skipped=${r.skipped}${r.error ? ` ERROR=${r.error}` : ""}`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("Sync failed:", err)
  process.exit(1)
})
```

- [ ] **Step 2: Add npm script to `apps/server/package.json`**

In the `scripts` block, add:

```json
"sync-revenue": "tsx scripts/sync-revenue.ts"
```

- [ ] **Step 3: Smoke test locally**

```bash
pnpm -F @ozap-office/server sync-revenue
```

Expected output:
```
[revenue-sync] [{"source":"cakto","inserted":N,"skipped":M},{"source":"abacatepay","inserted":X,"skipped":Y}]
Sync results:
  cakto: inserted=N skipped=M
  abacatepay: inserted=X skipped=Y
```

Verify rows in DB:

```bash
psql "$DATABASE_URL" -c "SELECT kind, source, COUNT(*), SUM(amount_brl_cents)/100 AS total_brl FROM ledger_entries GROUP BY kind, source"
```

Expected: rows for `revenue/cakto` and `revenue/abacatepay`.

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/sync-revenue.ts apps/server/package.json
git commit -m "feat(scripts): manual sync-revenue CLI"
```

---

## Task 9: Backend — Register daily cron

**Files:**
- Modify: `apps/server/src/scheduler/index.ts`

- [ ] **Step 1: Edit `apps/server/src/scheduler/index.ts`**

At the top, add import:

```ts
import { syncRevenue } from "../ingestion/revenue-sync.js"
```

Inside `startScheduler`, after the existing `setupCronJobs().catch(console.error)` line, append:

```ts
  cron.schedule("0 9 * * *", async () => {
    console.log("[revenue-sync] cron triggered")
    try {
      await syncRevenue()
    } catch (err) {
      console.error("[revenue-sync] cron failed:", err)
    }
  })
  console.log("Scheduled daily revenue sync at 09:00 UTC (06:00 BRT)")
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F @ozap-office/server typecheck
```

Expected: passes.

- [ ] **Step 3: Restart dev server, observe log**

Restart `pnpm dev:server`. Expected line in logs:

```
Scheduled daily revenue sync at 09:00 UTC (06:00 BRT)
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/scheduler/index.ts
git commit -m "feat(scheduler): daily revenue sync at 06:00 BRT"
```

---

## Task 10: Backend — Cost seed file

**Files:**
- Create: `apps/server/src/db/seed/costs.ts`
- Modify: `apps/server/src/db/seed.ts`

- [ ] **Step 1: Write `apps/server/src/db/seed/costs.ts`**

```ts
import { sql } from "drizzle-orm"
import { db } from "../client.js"
import { ledgerEntries } from "../schema.js"
import { toBrlCents } from "../../pnl/fx.js"

type CostSeed = {
  source: string
  category: string
  externalId: string
  amountCents: number
  currency: "BRL" | "USD"
  occurredAt: string
}

export const manualCosts: CostSeed[] = [
  { source: "salary", category: "payroll", externalId: "pedro-2026-05",
    amountCents: 450000, currency: "BRL", occurredAt: "2026-05-05" },
  { source: "openai", category: "ai_api", externalId: "openai-2026-04",
    amountCents: 20000, currency: "USD", occurredAt: "2026-04-30" },
  { source: "aws", category: "infra", externalId: "aws-2026-05",
    amountCents: 0, currency: "USD", occurredAt: "2026-05-31" },
]

export const seedCosts = async (): Promise<void> => {
  for (const c of manualCosts) {
    const amountBrl = toBrlCents(c.amountCents, c.currency)
    await db.execute(sql`
      INSERT INTO ${ledgerEntries}
        (kind, source, category, amount_cents, currency, amount_brl_cents, occurred_at, external_id, raw_json)
      VALUES
        ('cost', ${c.source}, ${c.category}, ${c.amountCents}, ${c.currency},
         ${amountBrl}, ${c.occurredAt}, ${c.externalId}, ${JSON.stringify({ seeded: true })}::jsonb)
      ON CONFLICT (source, external_id) DO UPDATE SET
        amount_cents = EXCLUDED.amount_cents,
        currency = EXCLUDED.currency,
        amount_brl_cents = EXCLUDED.amount_brl_cents,
        occurred_at = EXCLUDED.occurred_at
    `)
  }
  console.log(`Seeded ${manualCosts.length} manual cost rows`)
}
```

- [ ] **Step 2: Modify `apps/server/src/db/seed.ts`**

Add import (group with other relative imports near the top):

```ts
import { seedCosts } from "./seed/costs.js"
```

Find the line `console.log("Seed complete.")` near the end of `seedAgents()` (around the bottom of the function, immediately before `process.exit(0)`). Insert before that console.log:

```ts
  await seedCosts()
```

So the tail becomes:

```ts
  await seedCosts()
  console.log("Seed complete.")
  process.exit(0)
```

- [ ] **Step 3: Run seed**

Set `USD_TO_BRL=5.5` (if not in `.env`) and run:

```bash
pnpm -F @ozap-office/server db:seed
```

Expected: prints `Seeded 3 manual cost rows`.

Verify in DB:

```bash
psql "$DATABASE_URL" -c "SELECT source, category, amount_brl_cents/100 AS brl FROM ledger_entries WHERE kind='cost'"
```

Expected: 3 rows (`salary/payroll/4500`, `openai/ai_api/1100`, `aws/infra/0`).

- [ ] **Step 4: Verify `GET /api/pnl` now returns non-zero**

```bash
curl -s -H "x-api-key: $OZAP_OFFICE_API_KEY" "http://localhost:3001/api/pnl?month=2026-05" | jq
```

Expected: `kpis.costBrlCents > 0`, `costByCategory` array populated.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/seed/costs.ts apps/server/src/db/seed.ts
git commit -m "feat(seed): manual cost rows for P&L"
```

---

## Task 11: Frontend — API client + query hook

**Files:**
- Modify: `apps/web/lib/api-client.ts`
- Create: `apps/web/lib/queries/pnl-queries.ts`

- [ ] **Step 1: Add `PnlSummary` to the shared import in `api-client.ts`**

At the top of `apps/web/lib/api-client.ts`, find the `import type { ... } from "@ozap-office/shared"` block and add `PnlSummary`:

```ts
import type {
  AgentConfig,
  AgentEvent,
  Approval,
  ConversationMessage,
  InferenceConfig,
  Meeting,
  MeetingMessage,
  PnlSummary,
  TaskRun,
} from "@ozap-office/shared"
```

- [ ] **Step 2: Add `fetchPnl` to `api-client.ts`**

The file uses a shared `request<T>` helper. Add a new method inside the exported `api` object (look for the `export const api = { ... }` block; insert before its closing brace):

```ts
  fetchPnl: (month?: string): Promise<PnlSummary> =>
    request<PnlSummary>(`/api/pnl${month ? `?month=${month}` : ""}`),
```

- [ ] **Step 3: Write `apps/web/lib/queries/pnl-queries.ts`**

```ts
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"

export const usePnl = (month?: string) =>
  useQuery({
    queryKey: ["pnl", month ?? "current"],
    queryFn: () => api.fetchPnl(month),
    staleTime: 5 * 60 * 1000,
  })
```

- [ ] **Step 4: Typecheck**

```bash
pnpm -F @ozap-office/web typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api-client.ts apps/web/lib/queries/pnl-queries.ts
git commit -m "feat(web): usePnl query hook"
```

---

## Task 12: Frontend — `FinancePanel` component

**Files:**
- Create: `apps/web/lib/components/finance-panel.tsx`

- [ ] **Step 1: Write `apps/web/lib/components/finance-panel.tsx`**

```tsx
"use client"

import { usePnl } from "@/lib/queries/pnl-queries"
import type { PnlCategoryRow } from "@ozap-office/shared"

const formatBrl = (cents: number): string => {
  const reais = cents / 100
  if (reais >= 1000) return `R$${(reais / 1000).toFixed(1)}k`
  return `R$${reais.toFixed(2).replace(".", ",")}`
}

const categoryLabel: Record<string, string> = {
  card_payment: "Cartão",
  pix: "Pix",
  payroll: "Salário",
  ai_api: "API de IA",
  infra: "Infraestrutura",
}

const sourceLabel: Record<string, string> = {
  cakto: "Cakto",
  abacatepay: "AbacatePay",
  salary: "Pedro",
  openai: "OpenAI",
  aws: "AWS",
}

const rowLabel = (row: PnlCategoryRow): string => {
  const cat = categoryLabel[row.category] ?? row.category
  const src = sourceLabel[row.source] ?? row.source
  return `${src} (${cat})`
}

const Skeleton = () => (
  <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 bg-raised border border-edge rounded animate-pulse" />
      ))}
    </div>
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-6 bg-raised/50 rounded animate-pulse" />
      ))}
    </div>
  </div>
)

export const FinancePanel = () => {
  const { data, isLoading, error, refetch } = usePnl()

  if (isLoading) {
    return (
      <div className="bg-panel border border-edge rounded-lg p-4">
        <Skeleton />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-panel border border-edge rounded-lg p-4 text-center">
        <p className="text-sand text-sm mb-3">Não foi possível carregar finanças</p>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-xs uppercase tracking-widest text-gold border border-gold/30 rounded hover:bg-gold/10"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  const { kpis, revenueByCategory, costByCategory, month } = data
  const hasData = revenueByCategory.length > 0 || costByCategory.length > 0

  return (
    <div className="bg-panel border border-edge rounded-lg p-4 text-cream text-sm">
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="text-gold font-semibold">P&L</h4>
        <span className="text-mute text-xs">{month}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 my-3">
        <div className="bg-raised border border-edge rounded p-2.5">
          <div className="text-[10px] uppercase text-mute tracking-wider">Receita</div>
          <div className="text-lg font-semibold text-sage mt-0.5">{formatBrl(kpis.revenueBrlCents)}</div>
        </div>
        <div className="bg-raised border border-edge rounded p-2.5">
          <div className="text-[10px] uppercase text-mute tracking-wider">Custos</div>
          <div className="text-lg font-semibold text-coral mt-0.5">{formatBrl(kpis.costBrlCents)}</div>
        </div>
        <div className="bg-raised border border-edge rounded p-2.5">
          <div className="text-[10px] uppercase text-mute tracking-wider">Lucro</div>
          <div className="text-lg font-semibold text-gold mt-0.5">{formatBrl(kpis.profitBrlCents)}</div>
        </div>
      </div>

      {!hasData && (
        <p className="text-mute text-xs text-center py-3">Sem dados para {month}</p>
      )}

      {revenueByCategory.length > 0 && (
        <>
          <div className="text-[10px] uppercase text-mute tracking-wider mt-3 mb-1">Receita</div>
          {revenueByCategory.map((row) => (
            <div key={`r-${row.source}-${row.category}`} className="flex justify-between py-1.5 border-b border-edge text-xs">
              <span className="text-sand">{rowLabel(row)}</span>
              <span className="text-sage">{formatBrl(row.amountBrlCents)}</span>
            </div>
          ))}
        </>
      )}

      {costByCategory.length > 0 && (
        <>
          <div className="text-[10px] uppercase text-mute tracking-wider mt-3 mb-1">Custos</div>
          {costByCategory.map((row) => (
            <div key={`c-${row.source}-${row.category}`} className="flex justify-between py-1.5 border-b border-edge text-xs">
              <span className="text-sand">{rowLabel(row)}</span>
              <span className={row.amountBrlCents === 0 ? "text-mute" : "text-coral"}>
                {formatBrl(row.amountBrlCents)}
              </span>
            </div>
          ))}
        </>
      )}

      <div className="flex justify-between pt-3 mt-2 border-t-2 border-gold font-semibold">
        <span>Lucro líquido</span>
        <span className="text-gold">{formatBrl(kpis.profitBrlCents)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F @ozap-office/web typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/components/finance-panel.tsx
git commit -m "feat(web): FinancePanel component with KPIs + categories"
```

---

## Task 13: Frontend — Embed `FinancePanel` in `ThoughtPanel` when Finance agent selected

**Files:**
- Modify: `apps/web/lib/components/thought-panel.tsx`

- [ ] **Step 1: Add import to `thought-panel.tsx`**

Group with the other component imports near the top of `apps/web/lib/components/thought-panel.tsx`:

```ts
import { FinancePanel } from "./finance-panel"
```

- [ ] **Step 2: Derive `isFinance` from existing `selectedAgent`**

`selectedAgent` already exists at the line:

```ts
  const selectedAgent = agents.find((a) => a.id === (selectedAgentId ?? displayedAgentId))
```

Immediately after it, add:

```ts
  const isFinance = selectedAgent?.name === "Finance"
```

- [ ] **Step 3: Render `FinancePanel` above `SessionTabBar`**

Find the line:

```tsx
            <SessionTabBar agentId={selectedAgentId!} />
```

(currently around line 390 — the unique `<SessionTabBar`). Insert immediately before it:

```tsx
            {isFinance && (
              <div className="px-4 pt-3">
                <FinancePanel />
              </div>
            )}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm -F @ozap-office/web typecheck
```

Expected: passes.

- [ ] **Step 5: Manual smoke test (golden path)**

1. Restart `pnpm dev:web` if running.
2. Open `http://localhost:3000`.
3. Click the Finance agent in the canvas.
4. Verify ThoughtPanel opens with `FinancePanel` rendered at the top — KPI cards visible, categorized rows below, "Lucro líquido" total at the bottom.
5. Click a different agent → `FinancePanel` no longer renders.
6. Click Finance again → `FinancePanel` returns with same data (no full refetch flash thanks to staleTime).
7. Stop server (`pnpm dev:server`) → click Finance → "Não foi possível carregar finanças" + Retry button shown.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/components/thought-panel.tsx
git commit -m "feat(web): show FinancePanel when Finance agent selected"
```

---

## Final Validation

After Task 13, run the full MVP acceptance flow from the spec:

- [ ] **1.** `pnpm db:migrate` reports schema up to date
- [ ] **2.** `pnpm db:seed` ends with `Seeded 3 manual cost rows`
- [ ] **3.** `pnpm -F @ozap-office/server sync-revenue` reports `inserted=N>0` for at least one source (assumes there is recent activity in Cakto/AbacatePay)
- [ ] **4.** Click Finance agent in dev UI → panel opens
- [ ] **5.** KPI numbers are non-zero, breakdown rows visible
- [ ] **6.** Total profit = revenue − cost (verify by eyeballing the numbers)

If all green: push branch and open PR to deploy.

- [ ] **Push branch**

```bash
git push origin HEAD
```
