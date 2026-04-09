import { config } from "../config.js"
import { eq, and, asc, desc } from "drizzle-orm"
import { db } from "../db/client.js"
import { priceTests, priceTestVariants } from "../db/schema.js"
import { fetchAllOrders } from "../integrations/cakto-client.js"
import { fetchBillingPaidAmount } from "../integrations/abacatepay-client.js"

type ToolResult = { content: string; isError?: boolean }

const GITHUB_API_URL = "https://api.github.com/repos/omarcusdev/zap-landing/contents/src/config/promo-config.json"

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

const githubHeaders = () => ({
  Authorization: `Bearer ${config.githubToken}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
})

const calculatePromoStatus = (endDate: string) => {
  const end = new Date(endDate)
  const now = new Date()
  const msRemaining = end.getTime() - now.getTime()
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
  const isExpired = msRemaining < 0
  return { isExpired, daysRemaining }
}

const getActivePromo = async (_input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const response = await fetch(GITHUB_API_URL, { headers: githubHeaders() })

    if (response.status === 404) {
      return { content: JSON.stringify({ exists: false, message: "No promo config found. Use updatePromoConfig to create one." }) }
    }

    if (!response.ok) {
      return { content: `GitHub API error: ${response.status} ${response.statusText}`, isError: true }
    }

    const data = await response.json() as { sha: string; content: string }
    const decoded = Buffer.from(data.content, "base64").toString("utf-8")
    const promoConfig = JSON.parse(decoded)

    const { isExpired, daysRemaining } = calculatePromoStatus(promoConfig.endDate)

    return {
      content: JSON.stringify({
        exists: true,
        sha: data.sha,
        isExpired,
        daysRemaining,
        config: promoConfig,
      }),
    }
  } catch (error) {
    return { content: `Failed to fetch promo config: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const updatePromoConfig = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const promoName = input.promoName as string | undefined
    const endDate = input.endDate as string | undefined
    const badgeText = input.badgeText as string | undefined
    const emoji = input.emoji as string | undefined
    const isActive = input.isActive as boolean | undefined

    if (!promoName || !endDate || !badgeText) {
      return { content: "promoName, endDate, and badgeText are required", isError: true }
    }

    const currentResponse = await fetch(GITHUB_API_URL, { headers: githubHeaders() })

    const existingSha = currentResponse.ok
      ? ((await currentResponse.json()) as { sha: string }).sha
      : undefined

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

    const commitMessage = `promo: ${promoName} until ${endDate}`
    const encodedContent = Buffer.from(JSON.stringify(promoConfig, null, 2)).toString("base64")

    const body: Record<string, unknown> = {
      message: commitMessage,
      content: encodedContent,
    }

    if (existingSha) {
      body.sha = existingSha
    }

    const putResponse = await fetch(GITHUB_API_URL, {
      method: "PUT",
      headers: githubHeaders(),
      body: JSON.stringify(body),
    })

    if (!putResponse.ok) {
      const errorText = await putResponse.text()
      return { content: `Failed to update promo config: ${putResponse.status} ${errorText}`, isError: true }
    }

    return { content: JSON.stringify({ success: true, config: promoConfig }) }
  } catch (error) {
    return { content: `Failed to update promo config: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

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
