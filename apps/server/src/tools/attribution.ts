import { db } from "../db/client.js"
import { fetchAllOrders } from "../integrations/cakto-client.js"
import { sql } from "drizzle-orm"

type ToolResult = { content: string; isError?: boolean }

const DIRECT_BUCKET = "(direct)"

const bucketCampaign = (utmCampaign: string | null, utmSource: string | null): string => {
  if (utmCampaign && utmCampaign.trim() !== "") return utmCampaign
  if (utmSource && utmSource.trim() !== "") return `${utmSource}/(no-campaign)`
  return DIRECT_BUCKET
}

type ConversionRow = {
  campaign: string
  source: string
  orders: number
  revenue: number
  avgTicket: number
}

const getConversionAttribution = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required (YYYY-MM-DD)", isError: true }
  }

  try {
    const orders = await fetchAllOrders({
      paidStartDate: startDate,
      paidEndDate: endDate,
      status: "paid",
    })

    const buckets = new Map<string, ConversionRow>()
    for (const o of orders) {
      const campaign = bucketCampaign(o.utm_campaign, o.utm_source)
      const source = o.utm_source ?? DIRECT_BUCKET
      const key = `${campaign}__${source}`
      const existing = buckets.get(key)
      const amount = o.amount ?? 0
      if (existing) {
        existing.orders += 1
        existing.revenue += amount
      } else {
        buckets.set(key, { campaign, source, orders: 1, revenue: amount, avgTicket: 0 })
      }
    }

    const rows: ConversionRow[] = Array.from(buckets.values()).map((r) => ({
      ...r,
      revenue: Math.round(r.revenue * 100) / 100,
      avgTicket: r.orders > 0 ? Math.round((r.revenue / r.orders) * 100) / 100 : 0,
    }))
    rows.sort((a, b) => b.revenue - a.revenue)

    const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0)
    const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0)

    return {
      content: JSON.stringify({
        period: { start: startDate, end: endDate },
        totalOrders,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        breakdown: rows,
      }),
    }
  } catch (error) {
    return {
      content: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    }
  }
}

type FunnelRow = {
  campaign: string
  visits: number
  orders: number
  revenue: number
  cvr: number
  revenuePerVisit: number
}

const getCampaignFunnel = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string
  const site = input.site as string | undefined

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required (YYYY-MM-DD)", isError: true }
  }

  try {
    const siteFilter = site ? sql`AND site = ${site}` : sql``
    const visitRows = await db.execute<{ bucket: string; visits: number }>(sql`
      SELECT
        COALESCE(NULLIF(utm_campaign, ''), ${DIRECT_BUCKET}) AS bucket,
        COUNT(*)::int AS visits
      FROM page_views
      WHERE created_at >= ${startDate}::timestamp
        AND created_at < (${endDate}::date + INTERVAL '1 day')
        ${siteFilter}
      GROUP BY bucket
    `)

    const visitsByCampaign = new Map<string, number>()
    for (const r of visitRows) visitsByCampaign.set(r.bucket, r.visits)

    const orders = await fetchAllOrders({
      paidStartDate: startDate,
      paidEndDate: endDate,
      status: "paid",
    })

    const orderBuckets = new Map<string, { orders: number; revenue: number }>()
    for (const o of orders) {
      const campaign = bucketCampaign(o.utm_campaign, o.utm_source)
      const existing = orderBuckets.get(campaign)
      const amount = o.amount ?? 0
      if (existing) {
        existing.orders += 1
        existing.revenue += amount
      } else {
        orderBuckets.set(campaign, { orders: 1, revenue: amount })
      }
    }

    const allCampaigns = new Set<string>([
      ...visitsByCampaign.keys(),
      ...orderBuckets.keys(),
    ])

    const rows: FunnelRow[] = Array.from(allCampaigns).map((campaign) => {
      const visits = visitsByCampaign.get(campaign) ?? 0
      const orderData = orderBuckets.get(campaign) ?? { orders: 0, revenue: 0 }
      const revenue = Math.round(orderData.revenue * 100) / 100
      return {
        campaign,
        visits,
        orders: orderData.orders,
        revenue,
        cvr: visits > 0 ? Math.round((orderData.orders / visits) * 10000) / 10000 : 0,
        revenuePerVisit: visits > 0 ? Math.round((revenue / visits) * 100) / 100 : 0,
      }
    })
    rows.sort((a, b) => b.revenue - a.revenue)

    return {
      content: JSON.stringify({
        period: { start: startDate, end: endDate },
        site: site ?? "all",
        funnel: rows,
      }),
    }
  } catch (error) {
    return {
      content: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    }
  }
}

export const executeAttributionTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    getConversionAttribution,
    getCampaignFunnel,
  }
  const handler = tools[toolName]
  if (!handler) return { content: `Unknown attribution tool: ${toolName}`, isError: true }
  return handler(input)
}
