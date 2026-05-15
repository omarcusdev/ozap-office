import { sql } from "drizzle-orm"
import { db } from "../db/client.js"
import { ledgerEntries } from "../db/schema.js"
import { fetchAllOrders } from "../integrations/cakto-client.js"
import { fetchAllBillings } from "../integrations/abacatepay-client.js"

type SyncResult = { source: string; inserted: number; skipped: number; error?: string }

type SyncCounts = { inserted: number; skipped: number }

const watermark = async (source: string): Promise<string> => {
  const rows = await db.execute<{ max: string | null }>(sql`
    SELECT MAX(occurred_at)::text AS max FROM ${ledgerEntries} WHERE source = ${source}
  `)
  const max = Array.from(rows)[0]?.max ?? null
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
  const rows = await db.execute(sql`
    INSERT INTO ${ledgerEntries}
      (kind, source, category, amount_cents, currency, amount_brl_cents, occurred_at, external_id, raw_json)
    VALUES
      (${entry.kind}, ${entry.source}, ${entry.category}, ${entry.amountCents},
       ${entry.currency}, ${entry.amountBrlCents}, ${entry.occurredAt},
       ${entry.externalId}, ${JSON.stringify(entry.rawJson)}::jsonb)
    ON CONFLICT (source, external_id) DO NOTHING
    RETURNING id
  `)
  return Array.from(rows).length > 0
}

const tallyResults = (results: ReadonlyArray<boolean>): SyncCounts =>
  results.reduce<SyncCounts>(
    (acc, didInsert) =>
      didInsert
        ? { inserted: acc.inserted + 1, skipped: acc.skipped }
        : { inserted: acc.inserted, skipped: acc.skipped + 1 },
    { inserted: 0, skipped: 0 }
  )

const syncCakto = async (): Promise<SyncResult> => {
  try {
    const since = await watermark("cakto")
    const orders = await fetchAllOrders({
      paidStartDate: since.slice(0, 10),
      status: "paid",
    })
    const eligible = orders.filter((order) => order.paidAt !== null && order.amount !== null)
    const skippedUpfront = orders.length - eligible.length
    const outcomes = await Promise.all(
      eligible.map((order) =>
        upsertEntry({
          kind: "revenue",
          source: "cakto",
          category: "card_payment",
          amountCents: Math.round((order.amount as number) * 100),
          currency: "BRL",
          amountBrlCents: Math.round((order.amount as number) * 100),
          occurredAt: order.paidAt as string,
          externalId: order.id,
          rawJson: order,
        })
      )
    )
    const counts = tallyResults(outcomes)
    return { source: "cakto", inserted: counts.inserted, skipped: counts.skipped + skippedUpfront }
  } catch (err) {
    return { source: "cakto", inserted: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

const syncAbacatePay = async (): Promise<SyncResult> => {
  try {
    const billings = await fetchAllBillings()
    const eligible = billings.filter((billing) => billing.status === "PAID" && billing.paidAmount > 0)
    const skippedUpfront = billings.length - eligible.length
    const outcomes = await Promise.all(
      eligible.map((billing) =>
        upsertEntry({
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
      )
    )
    const counts = tallyResults(outcomes)
    return { source: "abacatepay", inserted: counts.inserted, skipped: counts.skipped + skippedUpfront }
  } catch (err) {
    return { source: "abacatepay", inserted: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

export const syncRevenue = async (): Promise<SyncResult[]> => {
  const [cakto, abacate] = await Promise.all([syncCakto(), syncAbacatePay()])
  console.log("[revenue-sync]", JSON.stringify([cakto, abacate]))
  return [cakto, abacate]
}
