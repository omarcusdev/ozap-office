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

  const all = Array.from(rows).map((row) => ({
    kind: row.kind,
    category: row.category,
    source: row.source,
    amount: Number(row.total),
  }))

  const revenueEntries = all.filter((r) => r.kind === "revenue")
  const costEntries = all.filter((r) => r.kind === "cost")

  const toRow = (r: { category: string; source: string; amount: number }): PnlCategoryRow => ({
    category: r.category,
    source: r.source,
    amountBrlCents: r.amount,
  })

  const revenueByCategory: PnlCategoryRow[] = revenueEntries.map(toRow)
  const costByCategory: PnlCategoryRow[] = costEntries.map(toRow)

  const revenueBrlCents = revenueEntries.reduce((sum, r) => sum + r.amount, 0)
  const costBrlCents = costEntries.reduce((sum, r) => sum + r.amount, 0)

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
