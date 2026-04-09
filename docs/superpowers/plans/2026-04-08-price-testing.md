# Price Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the Promo agent to autonomously A/B test 3 price tiers (197/297/397) for the ZapGPT lifetime plan, track revenue from Cakto + AbacatePay, and select the optimal price.

**Architecture:** New DB tables (`price_tests`, `price_test_variants`) track test cycles. AbacatePay V1 client provides Pix revenue via paidAmount snapshots. Three new Promo tools (`startPriceTest`, `getPriceTestStatus`, `collectAndAdvancePriceTest`) orchestrate the test lifecycle. The existing `updatePromoConfig` tool gains a `tier` parameter to set dynamic pricing.

**Tech Stack:** TypeScript/ESM, Drizzle ORM, PostgreSQL, AbacatePay V1 API, Cakto API (existing)

**Spec:** `docs/superpowers/specs/2026-04-08-price-testing-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/server/src/config.ts` | Modify | Add `abacatepayApiKey` |
| `apps/server/src/integrations/abacatepay-client.ts` | Create | AbacatePay V1 API client |
| `apps/server/src/db/schema.ts` | Modify | Add `priceTests` + `priceTestVariants` tables |
| `apps/server/drizzle/0006_*.sql` | Generate | Migration via `drizzle-kit generate` |
| `apps/server/src/tools/promo.ts` | Modify | Replace hardcoded config with tier map, add 3 new tools |
| `apps/server/src/runtime/tool-executor.ts` | Modify | Register 3 new tool names in `PROMO_TOOLS` |
| `apps/server/src/db/seed.ts` | Modify | Update Promo system prompt + add tool definitions |

---

### Task 1: Add AbacatePay config

**Files:**
- Modify: `apps/server/src/config.ts`

- [ ] **Step 1: Add abacatepayApiKey to config**

In `apps/server/src/config.ts`, add after the `githubToken` line:

```typescript
abacatepayApiKey: process.env.ABACATEPAY_API_KEY ?? "",
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/config.ts
git commit -m "feat: add AbacatePay API key to config"
```

---

### Task 2: Create AbacatePay client

**Files:**
- Create: `apps/server/src/integrations/abacatepay-client.ts`

- [ ] **Step 1: Create the client**

Create `apps/server/src/integrations/abacatepay-client.ts`:

```typescript
import { config } from "../config.js"

const ABACATEPAY_BASE_URL = "https://api.abacatepay.com/v1"

type AbacatepayBilling = {
  id: string
  amount: number
  paidAmount: number
  status: string
  frequency: string
  createdAt: string
  updatedAt: string
}

const abacatepayHeaders = () => ({
  Authorization: `Bearer ${config.abacatepayApiKey}`,
  "Content-Type": "application/json",
})

const assertApiKey = () => {
  if (!config.abacatepayApiKey) {
    throw new Error("AbacatePay API key not configured (ABACATEPAY_API_KEY)")
  }
}

export const fetchBillingPaidAmount = async (billId: string): Promise<number> => {
  assertApiKey()

  const response = await fetch(`${ABACATEPAY_BASE_URL}/billing/list`, {
    headers: abacatepayHeaders(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`AbacatePay API error (${response.status}): ${text}`)
  }

  const body = await response.json() as { data: AbacatepayBilling[] }
  const billing = body.data.find((b) => b.id === billId)

  if (!billing) {
    throw new Error(`AbacatePay billing not found: ${billId}`)
  }

  return billing.paidAmount ?? 0
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/integrations/abacatepay-client.ts
git commit -m "feat: add AbacatePay V1 API client for paidAmount tracking"
```

---

### Task 3: Add DB schema for price tests

**Files:**
- Modify: `apps/server/src/db/schema.ts`

- [ ] **Step 1: Add priceTests and priceTestVariants tables**

At the end of `apps/server/src/db/schema.ts`, add:

```typescript
export const priceTests = pgTable("price_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  winnerTier: text("winner_tier"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export const priceTestVariants = pgTable(
  "price_test_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id").notNull().references(() => priceTests.id),
    tier: text("tier").notNull(),
    order: integer("order").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    salesCount: integer("sales_count"),
    totalRevenue: integer("total_revenue"),
    caktoRevenue: integer("cakto_revenue"),
    pixRevenue: integer("pix_revenue"),
    pixPaidSnapshotStart: integer("pix_paid_snapshot_start"),
    pixPaidSnapshotEnd: integer("pix_paid_snapshot_end"),
  },
  (table) => [
    index("price_test_variants_test_idx").on(table.testId, table.order),
  ]
)
```

- [ ] **Step 2: Generate migration**

```bash
cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server db:generate
```

Expected: creates a new migration file `apps/server/drizzle/0006_*.sql` with CREATE TABLE statements for `price_tests` and `price_test_variants`.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/
git commit -m "feat: add price_tests and price_test_variants schema + migration"
```

---

### Task 4: Rewrite promo tools with price tiers and new tools

This is the core task. Replace the hardcoded `PAYMENT_CONFIG` with a tier map and add the 3 new price testing tools.

**Files:**
- Modify: `apps/server/src/tools/promo.ts`

- [ ] **Step 1: Replace PAYMENT_CONFIG with PRICE_TIERS and update updatePromoConfig**

In `apps/server/src/tools/promo.ts`, replace the `PAYMENT_CONFIG` constant (lines 7-18) with:

```typescript
type PriceTier = {
  price: string
  installments: string
  savings: string
  pixLink: string
  cardLink: string
  abacatepayBillId: string
}

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

const PRICE_ORIGINAL = "R$497"
const DEFAULT_TIER = "197"
```

Then update `updatePromoConfig` to accept an optional `tier` parameter. Replace the `promoConfig` construction inside that function (around line 86-91) with:

```typescript
    const tier = input.tier as string | undefined
    const activeTier = tier && PRICE_TIERS[tier] ? PRICE_TIERS[tier] : PRICE_TIERS[DEFAULT_TIER]

    const promoConfig = {
      promoName,
      emoji: emoji ?? "",
      endDate,
      badgeText,
      isActive: isActive ?? true,
      price: activeTier.price,
      priceOriginal: PRICE_ORIGINAL,
      installments: activeTier.installments,
      savings: activeTier.savings,
      pixLink: activeTier.pixLink,
      cardLink: activeTier.cardLink,
      defaultPixLink: PRICE_TIERS["397"].pixLink,
      defaultCardLink: PRICE_TIERS["397"].cardLink,
      defaultPrice: PRICE_TIERS["397"].price,
      defaultInstallments: PRICE_TIERS["397"].installments,
    }
```

- [ ] **Step 2: Add imports for DB and AbacatePay client**

At the top of `apps/server/src/tools/promo.ts`, add:

```typescript
import { eq, and, asc, desc } from "drizzle-orm"
import { db } from "../db/client.js"
import { priceTests, priceTestVariants } from "../db/schema.js"
import { fetchAllOrders } from "../integrations/cakto-client.js"
import { fetchBillingPaidAmount } from "../integrations/abacatepay-client.js"
```

- [ ] **Step 3: Add startPriceTest tool**

Add after `updatePromoConfig` and before the `executePromoTool` export:

```typescript
const shuffleArray = <T>(arr: T[]): T[] => {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = temp
  }
  return shuffled
}

const startPriceTest = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const agentId = input._agentId as string

    const existing = await db
      .select()
      .from(priceTests)
      .where(and(eq(priceTests.agentId, agentId), eq(priceTests.status, "running")))
      .limit(1)

    if (existing.length > 0) {
      return { content: JSON.stringify({ error: "A price test is already running", testId: existing[0].id }) }
    }

    const now = new Date()
    const tiers = shuffleArray(["197", "297", "397"])

    const [test] = await db.insert(priceTests).values({
      agentId,
      status: "running",
      startedAt: now,
    }).returning()

    const variantRows = tiers.map((tier, idx) => ({
      testId: test.id,
      tier,
      order: idx + 1,
      startedAt: idx === 0 ? now : null,
    }))

    await db.insert(priceTestVariants).values(variantRows)

    const firstTier = PRICE_TIERS[tiers[0]]
    const pixSnapshot = await fetchBillingPaidAmount(firstTier.abacatepayBillId)

    await db
      .update(priceTestVariants)
      .set({ pixPaidSnapshotStart: pixSnapshot })
      .where(and(eq(priceTestVariants.testId, test.id), eq(priceTestVariants.order, 1)))

    const variants = tiers.map((tier, idx) => ({
      tier,
      order: idx + 1,
      estimatedStart: new Date(now.getTime() + idx * 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      estimatedEnd: new Date(now.getTime() + (idx + 1) * 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    }))

    return {
      content: JSON.stringify({
        testId: test.id,
        activeTier: tiers[0],
        variants,
        message: `Price test started. First tier: R$${tiers[0]}. Update the promo config with tier="${tiers[0]}" to activate it on the LP.`,
      }),
    }
  } catch (error) {
    return { content: `Failed to start price test: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}
```

- [ ] **Step 4: Add getPriceTestStatus tool**

Add after `startPriceTest`:

```typescript
const getPriceTestStatus = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const agentId = input._agentId as string

    const [runningTest] = await db
      .select()
      .from(priceTests)
      .where(and(eq(priceTests.agentId, agentId), eq(priceTests.status, "running")))
      .limit(1)

    if (runningTest) {
      const variants = await db
        .select()
        .from(priceTestVariants)
        .where(eq(priceTestVariants.testId, runningTest.id))
        .orderBy(asc(priceTestVariants.order))

      const activeVariant = variants.find((v) => v.startedAt && !v.endedAt)
      const daysElapsed = activeVariant?.startedAt
        ? Math.floor((Date.now() - new Date(activeVariant.startedAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0

      return {
        content: JSON.stringify({
          status: "running",
          testId: runningTest.id,
          startedAt: runningTest.startedAt,
          activeVariant: activeVariant
            ? { tier: activeVariant.tier, order: activeVariant.order, startedAt: activeVariant.startedAt, daysElapsed, daysRemaining: 5 - daysElapsed }
            : null,
          variants: variants.map((v) => ({
            tier: v.tier,
            order: v.order,
            startedAt: v.startedAt,
            endedAt: v.endedAt,
            salesCount: v.salesCount,
            totalRevenue: v.totalRevenue,
          })),
        }),
      }
    }

    const [lastCompleted] = await db
      .select()
      .from(priceTests)
      .where(and(eq(priceTests.agentId, agentId), eq(priceTests.status, "completed")))
      .orderBy(desc(priceTests.completedAt))
      .limit(1)

    if (lastCompleted) {
      const daysSinceCompleted = Math.floor(
        (Date.now() - new Date(lastCompleted.completedAt!).getTime()) / (1000 * 60 * 60 * 24)
      )

      const variants = await db
        .select()
        .from(priceTestVariants)
        .where(eq(priceTestVariants.testId, lastCompleted.id))
        .orderBy(asc(priceTestVariants.order))

      return {
        content: JSON.stringify({
          status: "no_running_test",
          lastCompleted: {
            testId: lastCompleted.id,
            winnerTier: lastCompleted.winnerTier,
            completedAt: lastCompleted.completedAt,
            daysSinceCompleted,
            shouldStartNewTest: daysSinceCompleted >= 60,
            variants: variants.map((v) => ({
              tier: v.tier,
              salesCount: v.salesCount,
              totalRevenue: v.totalRevenue,
            })),
          },
        }),
      }
    }

    return { content: JSON.stringify({ status: "no_tests", message: "No price tests have been run yet. Use startPriceTest to begin." }) }
  } catch (error) {
    return { content: `Failed to get price test status: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}
```

- [ ] **Step 5: Add collectAndAdvancePriceTest tool**

Add after `getPriceTestStatus`:

```typescript
const collectAndAdvancePriceTest = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const agentId = input._agentId as string

    const [runningTest] = await db
      .select()
      .from(priceTests)
      .where(and(eq(priceTests.agentId, agentId), eq(priceTests.status, "running")))
      .limit(1)

    if (!runningTest) {
      return { content: JSON.stringify({ error: "No running price test found" }) }
    }

    const variants = await db
      .select()
      .from(priceTestVariants)
      .where(eq(priceTestVariants.testId, runningTest.id))
      .orderBy(asc(priceTestVariants.order))

    const activeVariant = variants.find((v) => v.startedAt && !v.endedAt)
    if (!activeVariant) {
      return { content: JSON.stringify({ error: "No active variant found in running test" }) }
    }

    const tierConfig = PRICE_TIERS[activeVariant.tier]
    const variantStartDate = new Date(activeVariant.startedAt!).toISOString().split("T")[0]
    const now = new Date()
    const nowDate = now.toISOString().split("T")[0]

    const caktoOrders = await fetchAllOrders({
      startDate: variantStartDate,
      endDate: nowDate,
      status: "paid",
    })

    const tierAmountCentavos = Number(activeVariant.tier) * 100
    const relevantOrders = caktoOrders.filter((o) => o.amount === tierAmountCentavos)
    const caktoRevenue = relevantOrders.reduce((sum, o) => sum + (o.amount ?? 0), 0)
    const caktoSales = relevantOrders.length

    const pixSnapshotEnd = await fetchBillingPaidAmount(tierConfig.abacatepayBillId)
    const pixRevenue = pixSnapshotEnd - (activeVariant.pixPaidSnapshotStart ?? 0)
    const pixSales = pixRevenue > 0 ? Math.round(pixRevenue / (Number(activeVariant.tier) * 100)) : 0

    const totalRevenue = caktoRevenue + pixRevenue
    const totalSales = caktoSales + pixSales

    await db
      .update(priceTestVariants)
      .set({
        endedAt: now,
        salesCount: totalSales,
        totalRevenue,
        caktoRevenue,
        pixRevenue,
        pixPaidSnapshotEnd: pixSnapshotEnd,
      })
      .where(eq(priceTestVariants.id, activeVariant.id))

    const nextVariant = variants.find((v) => !v.startedAt && v.order > activeVariant.order)

    if (nextVariant) {
      const nextTierConfig = PRICE_TIERS[nextVariant.tier]
      const nextPixSnapshot = await fetchBillingPaidAmount(nextTierConfig.abacatepayBillId)

      await db
        .update(priceTestVariants)
        .set({ startedAt: now, pixPaidSnapshotStart: nextPixSnapshot })
        .where(eq(priceTestVariants.id, nextVariant.id))

      return {
        content: JSON.stringify({
          variantCompleted: {
            tier: activeVariant.tier,
            totalRevenue,
            caktoRevenue,
            pixRevenue,
            salesCount: totalSales,
          },
          nextAction: "advanced",
          nextTier: nextVariant.tier,
          message: `Tier R$${activeVariant.tier} collected. Now testing R$${nextVariant.tier}. Update the promo config with tier="${nextVariant.tier}".`,
        }),
      }
    }

    const allVariants = await db
      .select()
      .from(priceTestVariants)
      .where(eq(priceTestVariants.testId, runningTest.id))
      .orderBy(asc(priceTestVariants.order))

    const winner = allVariants.reduce((best, v) =>
      (v.totalRevenue ?? 0) > (best.totalRevenue ?? 0) ? v : best
    )

    await db
      .update(priceTests)
      .set({
        status: "completed",
        completedAt: now,
        winnerTier: winner.tier,
      })
      .where(eq(priceTests.id, runningTest.id))

    return {
      content: JSON.stringify({
        variantCompleted: {
          tier: activeVariant.tier,
          totalRevenue,
          caktoRevenue,
          pixRevenue,
          salesCount: totalSales,
        },
        nextAction: "completed",
        winner: {
          tier: winner.tier,
          totalRevenue: winner.totalRevenue,
          salesCount: winner.salesCount,
        },
        allResults: allVariants.map((v) => ({
          tier: v.tier,
          totalRevenue: v.totalRevenue,
          salesCount: v.salesCount,
        })),
        message: `Price test completed! Winner: R$${winner.tier} with R$${((winner.totalRevenue ?? 0) / 100).toFixed(2)} revenue. Update promo config with tier="${winner.tier}".`,
      }),
    }
  } catch (error) {
    return { content: `Failed to collect/advance price test: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}
```

- [ ] **Step 6: Update executePromoTool to include new tools and pass agentId**

Replace the `executePromoTool` export with:

```typescript
export const executePromoTool = async (
  toolName: string,
  input: Record<string, unknown>,
  agentId?: string
): Promise<ToolResult> => {
  const inputWithAgent = { ...input, _agentId: agentId }

  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    getActivePromo,
    updatePromoConfig,
    startPriceTest,
    getPriceTestStatus,
    collectAndAdvancePriceTest,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown promo tool: ${toolName}`, isError: true }

  return handler(inputWithAgent)
}
```

- [ ] **Step 7: Verify typecheck passes**

```bash
cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/tools/promo.ts
git commit -m "feat: add price tier map and price testing tools to promo"
```

---

### Task 5: Update tool executor to route new tools and pass agentId

**Files:**
- Modify: `apps/server/src/runtime/tool-executor.ts`

- [ ] **Step 1: Add new tool names to PROMO_TOOLS and pass agentId**

In `apps/server/src/runtime/tool-executor.ts`, replace:

```typescript
const PROMO_TOOLS = ["getActivePromo", "updatePromoConfig"]
```

with:

```typescript
const PROMO_TOOLS = ["getActivePromo", "updatePromoConfig", "startPriceTest", "getPriceTestStatus", "collectAndAdvancePriceTest"]
```

Then update the promo routing block (around line 85-87) from:

```typescript
    if (PROMO_TOOLS.includes(toolName)) {
      return executePromoTool(toolName, toolInput)
    }
```

to:

```typescript
    if (PROMO_TOOLS.includes(toolName)) {
      return executePromoTool(toolName, toolInput, agentId)
    }
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/runtime/tool-executor.ts
git commit -m "feat: register price testing tools in tool executor"
```

---

### Task 6: Update seed — Promo system prompt and tool definitions

**Files:**
- Modify: `apps/server/src/db/seed.ts`

- [ ] **Step 1: Add 3 new tool definitions to promoTools array**

In `apps/server/src/db/seed.ts`, add these after the existing `updatePromoConfig` tool definition (after the closing `}` of `updatePromoConfig` around line 487, before the `]`):

```typescript
  {
    name: "startPriceTest",
    description: "Inicia um novo ciclo de teste de precos A/B. Cria 3 variantes (R$197, R$297, R$397) em ordem aleatoria e ativa a primeira. Cada variante roda ~5 dias. Retorna o plano do teste com as datas estimadas. Falha se ja existe um teste rodando.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "getPriceTestStatus",
    description: "Verifica o status do teste de precos. Se ha teste rodando: mostra variante ativa, dias decorridos e restantes. Se nao: mostra ultimo teste completado com o tier vencedor e se ja e hora de iniciar um novo (~2 meses).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "collectAndAdvancePriceTest",
    description: "Coleta dados de vendas (Cakto + AbacatePay) da variante ativa e avanca para a proxima. Se era a ultima variante, completa o teste e define o vencedor (maior receita total). Use quando a variante ativa ja tem ~5 dias.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
```

- [ ] **Step 2: Update Promo system prompt**

In the Promo agent seed entry (around line 700-740), replace rules 4 and 5:

Replace:
```
4. **Preço fixo**: O preço promocional é SEMPRE R$197,00 e o preço normal é R$397,00. Você NÃO controla os preços — eles são fixos no sistema.
5. **Links fixos**: Os links de pagamento são fixos e gerenciados pelo sistema. Você NÃO precisa informá-los.
```

With:
```
4. **Teste de preços**: Você controla o preço promocional entre 3 faixas (197, 297, 397). O preço original (riscado) é sempre R$497.
   - A cada ~2 meses, inicie um ciclo de teste com startPriceTest
   - Cada faixa roda ~5 dias. Use collectAndAdvancePriceTest quando a variante ativa completar ~5 dias
   - Ao final do ciclo, o sistema define o vencedor automaticamente (maior receita total)
   - Entre ciclos, use o preço vencedor do último teste ao criar promos (passe o parâmetro tier no updatePromoConfig)
   - Se nunca houve teste, inicie um como primeira ação
5. **Fluxo do cron**: No início de cada execução:
   - Use getPriceTestStatus para checar testes em andamento
   - Se há variante ativa com mais de 5 dias: use collectAndAdvancePriceTest, depois atualize a promo com o novo tier
   - Se não há teste e o último foi há mais de 2 meses (ou nunca houve): use startPriceTest
   - Depois, siga o fluxo normal de verificar/criar promos
```

Also update the `updatePromoConfig` tool description in the seed to mention the tier parameter. Replace its description with:

```
"Create or update the promotion on the ZapGPT landing page. Commits a new promo-config.json to the zap-landing GitHub repo. Vercel auto-deploys in ~30 seconds. Pass the 'tier' parameter to set the price tier (197, 297, or 397)."
```

And add `tier` to its inputSchema properties:

```typescript
tier: { type: "string", description: "Faixa de preço: '197', '297' ou '397'. Define o preço, parcelamento e links de pagamento da promo." },
```

Also update the `cronPrompt` for Promo to include price test checks. Replace:

```
Verifique a promoção atual da landing page do ZapGPT. Se estiver expirada ou expirando em menos de 2 dias, crie a próxima promoção. Consulte o calendário de datas comemorativas para decidir se deve ser sazonal ou genérica.
```

With:

```
Primeiro, verifique o status do teste de preços com getPriceTestStatus. Se há variante ativa com mais de 5 dias, use collectAndAdvancePriceTest e atualize a promo com o novo tier. Se não há teste rodando e o último foi há mais de 2 meses (ou nunca houve), inicie um novo com startPriceTest. Depois, verifique a promoção atual com getActivePromo. Se estiver expirada ou expirando em menos de 2 dias, crie a próxima promoção usando o tier ativo do teste. Consulte o calendário de datas comemorativas para decidir se deve ser sazonal ou genérica.
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/server typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/db/seed.ts
git commit -m "feat: update Promo agent seed with price testing tools and dynamic pricing prompt"
```

---

### Task 7: Update CLAUDE.md and env docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

In the Tool System section, update the `tools/promo.ts` line from:

```
- `tools/promo.ts` — getActivePromo, updatePromoConfig (GitHub-backed promo configuration)
```

to:

```
- `tools/promo.ts` — getActivePromo, updatePromoConfig, startPriceTest, getPriceTestStatus, collectAndAdvancePriceTest (GitHub-backed promo + autonomous price A/B testing)
```

In the Supporting integrations section, add:

```
- `abacatepay-client.ts` — AbacatePay V1 API client (Pix payment revenue tracking)
```

In the Environment Variables section, add `ABACATEPAY_API_KEY` to the optional list.

In the Database section, add `price_tests`, `price_test_variants` to the tables list.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with price testing tools and AbacatePay integration"
```

---

### Task 8: Run migration and seed on production

**Files:** none (remote commands only)

- [ ] **Step 1: Add ABACATEPAY_API_KEY to production .env**

Add `ABACATEPAY_API_KEY=<key>` to `/opt/ozap-office/.env` via SSM. The key value is known — do not commit it to source.

- [ ] **Step 2: Deploy, run migration, and seed**

Use the full deploy command from CLAUDE.md to pull, build, migrate, seed, and restart PM2.

- [ ] **Step 3: Verify server starts successfully**

Check PM2 logs to confirm no startup errors.
