# Finance P&L Panel — Design

**Date:** 2026-05-15
**Status:** Draft
**Author:** Marcus + Claude

## Problem

Pedro asked Marcus for a revenue-vs-cost report. No tool today combines revenue (Cakto cards + AbacatePay Pix) with costs (OpenAI billing, Pedro's salary, AWS). The existing `getRevenueSummary` only returns Cakto revenue; costs live only in a one-shot offline script with hardcoded env vars (`scripts/ai-cost-report.ts`).

## Goal

Read-only P&L panel that opens when clicking the Finance agent in the office canvas. Shows current-month revenue, costs, and profit. Data flows from a single `ledger_entries` table populated by a daily revenue cron and a manual cost seed file. No UI for cost entry in MVP.

## Non-Goals

- UI to register costs (deferred — manual TS seed file only for MVP)
- Multi-month selector (current month only)
- Live API pulls on panel open (daily cron snapshot)
- OpenAI Usage API / AWS Cost Explorer automation (deferred phase 2)
- Tests (no test coverage in this feature for MVP)
- Finance agent tool surface (`getProfitLoss`) — deferred phase 2
- USD/BRL FX rate historical tracking (single env var for MVP)

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ apps/web (Next.js)                                   │
│  └─ FinancePanel.tsx                                 │
│       └─ usePnl(month) → GET /api/pnl?month=...      │
└──────────────────────────────────────────────────────┘
                    │ x-api-key
                    ▼
┌──────────────────────────────────────────────────────┐
│ apps/server (Fastify)                                │
│  ├─ routes/pnl.ts          GET /api/pnl              │
│  ├─ pnl/aggregator.ts      pure SUM GROUP BY         │
│  ├─ pnl/fx.ts              USD→BRL lock-at-insert    │
│  ├─ ingestion/             cron daily ingestion      │
│  │   └─ revenue-sync.ts    cakto + abacatepay        │
│  ├─ db/schema.ts           ledger_entries (new)      │
│  └─ db/seed/costs.ts       manual cost rows          │
└──────────────────────────────────────────────────────┘
                    │
                    ▼
              PostgreSQL — ledger_entries
```

Three write paths into `ledger_entries`:

1. **Revenue cron** — daily 06:00 BRT, fetches Cakto orders + AbacatePay charges since last watermark, upserts.
2. **Cost seed** — manual TS file at `db/seed/costs.ts`, run via `pnpm db:seed`. Upserts by `(source, external_id)`.
3. **Manual ad-hoc** — deferred (future Finance agent tool).

One read path: `GET /api/pnl?month=YYYY-MM` aggregates and returns `PnlSummary`.

## Schema

New table:

```sql
CREATE TABLE ledger_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('revenue','cost')),
  source          text NOT NULL,
  category        text NOT NULL,
  amount_cents    bigint NOT NULL,
  currency        text NOT NULL CHECK (currency IN ('BRL','USD')),
  amount_brl_cents bigint NOT NULL,
  occurred_at     date NOT NULL,
  external_id     text NOT NULL,
  raw_json        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ledger_entries_kind_date_idx ON ledger_entries (kind, occurred_at);
CREATE UNIQUE INDEX ledger_entries_source_extid_idx ON ledger_entries (source, external_id);
```

**Source values (initial):** `cakto`, `abacatepay`, `openai`, `salary`, `aws`. Free-form text — new sources added by inserting rows, no migration.

**Category values (initial):** `card_payment`, `pix`, `ai_api`, `payroll`, `infra`. Same — extensible without migration.

**Amount sign convention:** always positive. `kind` discriminates revenue from cost. Profit = `SUM(revenue) − SUM(cost)`.

**FX handling:** USD amounts converted to BRL at insert time using `USD_TO_BRL` env var (default 5.5). `amount_brl_cents` is what queries SUM. Historical entries never re-converted.

## Components

### Backend (`apps/server/src/`)

| File | Purpose |
|------|---------|
| `db/schema.ts` | Add `ledgerEntries` Drizzle table |
| `db/seed/costs.ts` | Export `manualCosts: CostSeed[]` with Pedro salary, OpenAI estimate, AWS R$0 |
| `db/seed.ts` | Import + call `seedCosts(db)` after agent seeding |
| `pnl/aggregator.ts` | `aggregateMonth(db, monthStart): Promise<PnlSummary>` |
| `pnl/fx.ts` | `usdToBrl(cents: number): number` reading `USD_TO_BRL` env |
| `ingestion/revenue-sync.ts` | `syncRevenue()` function fetching Cakto + AbacatePay |
| `routes/pnl.ts` | `GET /api/pnl?month=YYYY-MM` |
| `scheduler/index.ts` | Register `cron.schedule('0 9 * * *', syncRevenue)` next to existing agent scheduler (09:00 UTC = 06:00 BRT; EC2 runs UTC) |
| `scripts/sync-revenue.ts` | Manual CLI for one-off sync: `pnpm -F @ozap-office/server tsx scripts/sync-revenue.ts` |

### Frontend (`apps/web/lib/`)

| File | Purpose |
|------|---------|
| `components/finance-panel.tsx` | 450px panel, Layout A (KPI cards + categorized lists) |
| `queries/pnl-queries.ts` | `usePnl(month)` TanStack Query hook, staleTime 5min |

### Wiring

`apps/web/app/page.tsx` — extend existing panel switching logic so clicking the Finance agent opens `FinancePanel`. Mirror approach of existing panels (`approvals-panel`, `meeting-panel`, `thought-panel`).

### Shared types (`packages/shared/`)

```ts
export type PnlSummary = {
  month: string
  kpis: { revenueBrlCents: number; costBrlCents: number; profitBrlCents: number }
  revenueByCategory: Array<{ category: string; source: string; amountBrlCents: number }>
  costByCategory: Array<{ category: string; source: string; amountBrlCents: number }>
}
```

### Migration

Generated by `pnpm db:generate` after schema edit. Latest existing migration is `0009_closed_moon_knight.sql`; new file will be `0010_*.sql` (drizzle-kit picks name).

## Data Flow

### Revenue cron (daily 06:00 BRT)

```
1. lastSync = SELECT MAX(occurred_at) FROM ledger_entries WHERE source='cakto'
2. orders = caktoClient.getOrders({ from: lastSync, to: now })
3. For each order: UPSERT into ledger_entries
     (kind='revenue', source='cakto', category='card_payment',
      amount_cents, currency='BRL', amount_brl_cents=amount_cents,
      occurred_at=paid_at::date, external_id=order.id, raw_json=order)
4. Repeat for AbacatePay: source='abacatepay', category='pix'
5. Emit event to events table: {syncedCakto: N, syncedAbacate: M}
```

Idempotent via `ON CONFLICT (source, external_id) DO NOTHING`. Watermark recovery: each run computes `lastSync` from DB max, not stored cursor.

### Cost seed

```ts
// apps/server/src/db/seed/costs.ts
type CostSeed = {
  source: string
  category: string
  externalId: string
  amountCents: number
  currency: 'BRL' | 'USD'
  occurredAt: string
}

export const manualCosts: CostSeed[] = [
  { source: 'salary', category: 'payroll',
    externalId: 'pedro-2026-05', amountCents: 450000,
    currency: 'BRL', occurredAt: '2026-05-05' },
  { source: 'openai', category: 'ai_api',
    externalId: 'openai-2026-04', amountCents: 20000,
    currency: 'USD', occurredAt: '2026-04-30' },
  { source: 'aws', category: 'infra',
    externalId: 'aws-2026-05', amountCents: 0,
    currency: 'USD', occurredAt: '2026-05-31' },
]
```

Seed inserts with `ON CONFLICT (source, external_id) DO UPDATE SET amount_cents, amount_brl_cents, raw_json`. Editing a value = change number + re-run seed.

### API read

```sql
SELECT kind, category, source,
       SUM(amount_brl_cents)::bigint AS total
FROM ledger_entries
WHERE occurred_at >= $1 AND occurred_at < $2
GROUP BY kind, category, source
ORDER BY kind, total DESC;
```

Aggregator splits rows into `revenue[]` + `cost[]`, computes KPI totals, returns `PnlSummary`. No month selector in MVP — server uses current month BRT.

### Frontend render

```
Click Finance agent → setActivePanel('finance')
  → FinancePanel mount
  → usePnl('2026-05') queries /api/pnl
  → Render Layout A:
       header (agent name + month)
       3 KPI cards (Receita/Custos/Lucro)
       "Receita" section label + rows per (source, category)
       "Custos" section label + rows per (source, category)
       Bottom totals row
```

## Error Handling

### Cron revenue sync

| Failure | Handling |
|---------|----------|
| Cakto API down | try/catch around Cakto block; log to events; AbacatePay still runs |
| AbacatePay API down | same, independent |
| Mid-fetch crash | already-inserted rows persist; next run resumes from `MAX(occurred_at)` |
| Duplicate `external_id` | `ON CONFLICT DO NOTHING` silently skips |

### API route

| Case | Behavior |
|------|----------|
| Missing `month` param | Default to current month BRT |
| Malformed `month` (e.g. `2026-13`) | 400 `{error: 'invalid month, expected YYYY-MM'}` |
| Zero rows | Return empty arrays with zero totals (not 404) |
| Missing/invalid `x-api-key` | 401 via existing middleware |

### FX conversion

- `USD_TO_BRL` env var required when inserting USD entries
- If env unset and USD entry attempted → throw `Error('USD_TO_BRL required')` — fail fast, no silent default
- Historical entries never re-converted; past P&L stable

### Frontend states

| State | UI |
|-------|----|
| Loading | Skeleton: 3 KPI placeholders + 3 row skeletons |
| Error | "Não foi possível carregar finanças" + Retry button; keeps last cached data |
| Empty (zero rows) | "Sem dados para Mai/2026" — panel stays open |
| Stale (>1h since last cron) | Subtle "Atualizado há Xh" badge under header |

## Open Questions (deferred to phase 2)

- OpenAI Usage API automation: requires admin API key — verify Marcus has access before planning
- AWS Cost Explorer: enable for tracking phantom cost even while on credits
- Multi-month selector in panel
- `getProfitLoss` Finance agent tool — exposes same `/api/pnl` data to Bedrock Converse loop
- USD/BRL rate history table (replacing single env var)
- CRUD UI for ad-hoc cost entry

## MVP Acceptance

1. `pnpm db:migrate` creates `ledger_entries` table
2. `pnpm db:seed` populates Pedro salary + OpenAI April + AWS placeholder
3. Running `tsx apps/server/scripts/sync-revenue.ts` inserts current-month Cakto + AbacatePay rows
4. Click Finance agent in deployed UI → panel opens
5. Panel displays current month revenue total, cost total, profit total, and per-category breakdown
6. Marcus can copy numbers from panel to send to Pedro
