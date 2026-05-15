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
