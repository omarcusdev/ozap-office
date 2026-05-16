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

const PEDRO_START_MONTH = "2026-05"
const PEDRO_BRL_CENTS = 150000
const PEDRO_PAYDAY = "05"

const monthIso = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`

const monthRange = (startMonth: string, endMonth: string): string[] => {
  const [startYear, startMonthIdx] = startMonth.split("-").map(Number)
  const [endYear, endMonthIdx] = endMonth.split("-").map(Number)
  const months: string[] = []
  const cursor = new Date(Date.UTC(startYear, startMonthIdx - 1, 1))
  const stop = new Date(Date.UTC(endYear, endMonthIdx - 1, 1))
  while (cursor.getTime() <= stop.getTime()) {
    months.push(monthIso(cursor))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return months
}

const pedroEntries = (): CostSeed[] => {
  const currentMonth = monthIso(new Date())
  return monthRange(PEDRO_START_MONTH, currentMonth).map((month) => ({
    source: "salary",
    category: "payroll",
    externalId: `pedro-${month}`,
    amountCents: PEDRO_BRL_CENTS,
    currency: "BRL",
    occurredAt: `${month}-${PEDRO_PAYDAY}`,
  }))
}

export const buildRecurringCosts = (): CostSeed[] => [
  ...pedroEntries(),
  { source: "aws", category: "infra", externalId: "aws-2026-05",
    amountCents: 0, currency: "USD", occurredAt: "2026-05-31" },
]

export const seedCosts = async (): Promise<void> => {
  const costs = buildRecurringCosts()
  for (const c of costs) {
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
  console.log(`Seeded ${costs.length} recurring cost rows`)
}
