# Price Testing for Promo Agent

## Summary

Enable the Promo agent to autonomously test 3 price tiers (R$197, R$297, R$397) for the ZapGPT lifetime plan, measure revenue from each, and select the optimal price. The agent runs periodic test cycles (~every 2 months), testing each tier for ~5 days, then fixes the winner as the default promo price until the next cycle.

The Promo agent continues its existing role of keeping promotions active ~80% of the time. The only change is that the promotional price becomes dynamic instead of hardcoded at R$197.

## Price Tiers

Each tier has dedicated payment links for both Pix (AbacatePay) and card (Cakto):

| Tier | Price | Original (strikethrough) | Installments | Pix Link | Card Link |
|------|-------|--------------------------|--------------|----------|-----------|
| 197 | R$197,00 | R$497 | 12x de R$19,67 | `bill_ZM4Pm0PgHpjfWzPQ5eRthqjx` | `39jee69` |
| 297 | R$297,00 | R$497 | 12x de R$29,67 | `bill_exkJAekGTTRDbSM1npCqx6Gy` | `39c24k9` |
| 397 | R$397,00 | R$497 | 12x de R$39,67 | `bill_yqqpmYHWQGT1D3yCXdxJZCMs` | `ijjptyj` |

The `priceOriginal` (R$497, shown as strikethrough on the LP) never changes.

## Data Model

### Table: `price_tests`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `agent_id` | uuid FK -> agents | Promo agent |
| `status` | text | `running` or `completed` |
| `started_at` | timestamp | Cycle start |
| `completed_at` | timestamp (nullable) | Cycle end |
| `winner_tier` | text (nullable) | `197`, `297`, or `397` -- set on completion |
| `created_at` | timestamp | |

### Table: `price_test_variants`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `test_id` | uuid FK -> price_tests | |
| `tier` | text | `197`, `297`, `397` |
| `order` | integer | Execution order (1, 2, 3) -- randomized to avoid bias |
| `started_at` | timestamp (nullable) | When this variant went live |
| `ended_at` | timestamp (nullable) | When it was replaced |
| `sales_count` | integer (nullable) | Total sales (Cakto + AbacatePay) |
| `total_revenue` | integer (nullable) | In centavos (Cakto + AbacatePay) |
| `cakto_revenue` | integer (nullable) | Card revenue in centavos |
| `pix_revenue` | integer (nullable) | Pix revenue in centavos |
| `pix_paid_snapshot_start` | integer (nullable) | AbacatePay paidAmount at variant start |
| `pix_paid_snapshot_end` | integer (nullable) | AbacatePay paidAmount at variant end |

## AbacatePay Integration

New integration: `integrations/abacatepay-client.ts`

- **API:** V1 (`https://api.abacatepay.com/v1`)
- **Auth:** Bearer token (`ABACATEPAY_API_KEY` env var)
- **Endpoint used:** `GET /v1/billing/list` -- returns all payment links with `paidAmount`

### Revenue tracking approach

AbacatePay V1 API lacks date-filtered transaction queries. Revenue per variant is tracked via **paidAmount snapshots**:

1. When a variant starts: fetch the bill for that tier, record `paidAmount` as `pix_paid_snapshot_start`
2. When a variant ends: fetch again, record as `pix_paid_snapshot_end`
3. Pix revenue = `pix_paid_snapshot_end - pix_paid_snapshot_start`

The client exposes a single function: `fetchBillingPaidAmount(billId: string): Promise<number>` that fetches the billing list and returns the `paidAmount` for the given bill ID.

### Cakto revenue tracking

Already supported via `cakto-client.ts`. Filter orders by date range + status `paid`. Since only one price tier is active at a time, all paid orders during a variant period belong to that tier.

## Tools

Three new tools for the Promo agent:

### `startPriceTest`

- Validates no test is currently `running`
- Creates a `price_test` with status `running`
- Creates 3 `price_test_variants` with randomized execution order
- Activates the first variant: updates `promo-config.json` on GitHub with the corresponding tier's price and links
- Snapshots the first variant's `pix_paid_snapshot_start` from AbacatePay
- Returns the test plan (variant order, estimated dates)

**Input:** none
**Output:** `{ testId, variants: [{ tier, order, estimatedStart, estimatedEnd }] }`

### `getPriceTestStatus`

- Returns the current `running` test with all variants and their status
- Shows: which variant is active, days elapsed, days remaining
- If no running test: returns the last `completed` test with winner
- If no tests exist: returns `{ noTests: true }`

**Input:** none
**Output:** `{ test: { status, variants, activeVariant, daysElapsed, daysRemaining }, lastCompleted?: { winnerTier, completedAt } }`

### `collectAndAdvancePriceTest`

Collects sales data for the active variant and either advances to the next or completes the test.

Steps:
1. Fetch Cakto orders for the variant period (date range + status `paid`)
2. Snapshot AbacatePay `paidAmount` for the active tier's bill
3. Calculate: `cakto_revenue`, `pix_revenue` (delta from snapshots), `total_revenue`, `sales_count`
4. Update the current variant with results, set `ended_at`
5. If more variants remain:
   - Activate next variant (update `promo-config.json` with next tier's price/links)
   - Snapshot next variant's `pix_paid_snapshot_start`
6. If last variant:
   - Compare `total_revenue` across all 3 variants
   - Set `winner_tier` on the test, mark as `completed`
   - Update `promo-config.json` with the winning tier's price/links

**Input:** none
**Output:** `{ variantCompleted: { tier, revenue, sales }, nextAction: "advanced" | "completed", winner?: { tier, revenue } }`

## PAYMENT_CONFIG Changes

The current hardcoded `PAYMENT_CONFIG` in `tools/promo.ts` becomes a tier map:

```typescript
const PRICE_TIERS: Record<string, PriceTier> = {
  "197": {
    price: "R$197,00",
    installments: "12x de R$19,67",
    savings: "ECONOMIA DE R$ 300",
    pixLink: "https://app.abacatepay.com/pay/bill_ZM4Pm0PgHpjfWzPQ5eRthqjx",
    cardLink: "https://pay.cakto.com.br/39jee69",
    abacatepayBillId: "bill_ZM4Pm0PgHpjfWzPQ5eRthqjx",
  },
  "297": {
    price: "R$297,00",
    installments: "12x de R$29,67",
    savings: "ECONOMIA DE R$ 200",
    pixLink: "https://app.abacatepay.com/pay/bill_exkJAekGTTRDbSM1npCqx6Gy",
    cardLink: "https://pay.cakto.com.br/39c24k9",
    abacatepayBillId: "bill_exkJAekGTTRDbSM1npCqx6Gy",
  },
  "397": {
    price: "R$397,00",
    installments: "12x de R$39,67",
    savings: "ECONOMIA DE R$ 100",
    pixLink: "https://app.abacatepay.com/pay/bill_yqqpmYHWQGT1D3yCXdxJZCMs",
    cardLink: "https://pay.cakto.com.br/ijjptyj",
    abacatepayBillId: "bill_yqqpmYHWQGT1D3yCXdxJZCMs",
  },
}
```

The `priceOriginal` stays constant at `R$497`. The `defaultPrice` / `defaultPixLink` / `defaultCardLink` are removed -- the "default" is now whatever tier won the last test (or `197` if no test has run).

The `updatePromoConfig` tool is updated to accept an optional `tier` parameter. When provided, it pulls price/links from `PRICE_TIERS[tier]` instead of from the old hardcoded config.

## System Prompt Changes

Remove rule #4: "Preço fixo: O preço promocional e SEMPRE R$197,00... Voce NAO controla os precos".

Add new rules:

```
4. **Teste de precos**: Voce controla o preco promocional entre 3 faixas (197, 297, 397).
   O preco original (riscado) e sempre R$497.
   - A cada ~2 meses, inicie um ciclo de teste com startPriceTest
   - Cada faixa roda ~5 dias. Use collectAndAdvancePriceTest quando a variante ativa
     completar seus ~5 dias
   - Ao final do ciclo, o sistema define o vencedor automaticamente (maior receita total)
   - Entre ciclos, use o preco vencedor do ultimo teste
   - Se nunca houve teste, inicie um como primeira acao

5. **Fluxo do cron**: No inicio de cada execucao:
   - Use getPriceTestStatus para checar testes em andamento
   - Se ha variante ativa com mais de 5 dias: use collectAndAdvancePriceTest
   - Se nao ha teste e o ultimo foi ha mais de 2 meses (ou nunca houve): use startPriceTest
   - Depois, siga o fluxo normal de verificar/criar promos
```

## File Changes

### New files
- `apps/server/src/integrations/abacatepay-client.ts` -- AbacatePay V1 API client
- `apps/server/drizzle/XXXX_price_tests.sql` -- migration for price_tests + price_test_variants

### Modified files
- `apps/server/src/db/schema.ts` -- add `priceTests` and `priceTestVariants` table definitions
- `apps/server/src/tools/promo.ts` -- replace `PAYMENT_CONFIG` with `PRICE_TIERS` map; add `startPriceTest`, `getPriceTestStatus`, `collectAndAdvancePriceTest`; update `updatePromoConfig` to accept `tier`
- `apps/server/src/runtime/tool-executor.ts` -- register 3 new tool names
- `apps/server/src/db/seed.ts` -- update Promo system prompt; add 3 new tool definitions to `promoTools`
- `apps/server/src/config.ts` -- add `abacatepayApiKey` from `ABACATEPAY_API_KEY` env var
- `CLAUDE.md` -- add AbacatePay integration reference, `ABACATEPAY_API_KEY` env var

### No changes needed
- Landing page (zap-landing) -- already reads dynamic price/links from `promo-config.json`
- Frontend (apps/web) -- no UI changes
- Finance agent -- unaffected
- Other agents -- unaffected

## Test Cycle Example

1. Promo cron runs, no test exists -> calls `startPriceTest`
2. System randomizes order: [297, 197, 397]. Activates 297 on the LP.
3. 5 days later, cron runs -> `collectAndAdvancePriceTest`. Collects 297 sales, activates 197.
4. 5 more days -> collects 197 sales, activates 397.
5. 5 more days -> collects 397 sales. Compares all 3:
   - 197: 12 sales, R$2.364
   - 297: 8 sales, R$2.376
   - 397: 5 sales, R$1.985
   Winner: 297 (highest revenue). Sets 297 as the active tier.
6. ~2 months later, cycle repeats.

Throughout, the Promo agent keeps creating themed promos (Easter, Mother's Day, etc.) -- only the price tier changes.
