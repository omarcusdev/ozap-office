import { sql } from "drizzle-orm"
import { db } from "../db/client.js"
import { ledgerEntries } from "../db/schema.js"
import { fetchDailyCosts } from "../integrations/openai-usage-client.js"
import { toBrlCents } from "../pnl/fx.js"

type SyncResult = { source: string; inserted: number; skipped: number; error?: string }
type SyncCounts = { inserted: number; skipped: number }

const LOOKBACK_DAYS = 60

const lookbackStart = (): number => {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS)
  start.setUTCHours(0, 0, 0, 0)
  return Math.floor(start.getTime() / 1000)
}

const upsertCost = async (date: string, amountUsdCents: number): Promise<boolean> => {
  const amountBrlCents = toBrlCents(amountUsdCents, "USD")
  const externalId = `openai-${date}`
  const rows = await db.execute(sql`
    INSERT INTO ${ledgerEntries}
      (kind, source, category, amount_cents, currency, amount_brl_cents, occurred_at, external_id, raw_json)
    VALUES
      ('cost', 'openai', 'ai_api', ${amountUsdCents}, 'USD',
       ${amountBrlCents}, ${date}, ${externalId}, ${JSON.stringify({ syncedAt: new Date().toISOString() })}::jsonb)
    ON CONFLICT (source, external_id) DO UPDATE SET
      amount_cents = EXCLUDED.amount_cents,
      amount_brl_cents = EXCLUDED.amount_brl_cents
    RETURNING (xmax = 0) AS inserted
  `)
  const row = Array.from(rows)[0] as { inserted: boolean } | undefined
  return row?.inserted ?? false
}

export const syncOpenAICosts = async (): Promise<SyncResult> => {
  try {
    const startUnix = lookbackStart()
    const endUnix = Math.floor(Date.now() / 1000)
    const dailyCosts = await fetchDailyCosts(startUnix, endUnix)
    const eligible = dailyCosts.filter((c) => c.amountUsdCents > 0)
    const skippedUpfront = dailyCosts.length - eligible.length
    const outcomes = await Promise.all(
      eligible.map((c) => upsertCost(c.date, c.amountUsdCents))
    )
    const counts: SyncCounts = outcomes.reduce<SyncCounts>(
      (acc, inserted) => ({
        inserted: acc.inserted + (inserted ? 1 : 0),
        skipped: acc.skipped + (inserted ? 0 : 1),
      }),
      { inserted: 0, skipped: 0 }
    )
    return { source: "openai", inserted: counts.inserted, skipped: counts.skipped + skippedUpfront }
  } catch (err) {
    return { source: "openai", inserted: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
