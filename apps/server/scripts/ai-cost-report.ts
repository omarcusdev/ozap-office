import "dotenv/config"
import postgres from "postgres"

const TOTAL_AI_COST_USD = Number(process.env.TOTAL_AI_COST_USD ?? 200)
const USD_TO_BRL = Number(process.env.USD_TO_BRL ?? 5.5)
const ASSUMED_OZAPONLINE_MRR_BRL = Number(process.env.ASSUMED_OZAPONLINE_MRR_BRL ?? 80)
const ASSUMED_LEGACY_MRR_BRL = Number(process.env.ASSUMED_LEGACY_MRR_BRL ?? 49)
const DAYS_WINDOW = Number(process.env.DAYS_WINDOW ?? 30)

const fmtUsd = (n: number) => `$${n.toFixed(2)}`
const fmtBrl = (n: number) => `R$${n.toFixed(2).replace(".", ",")}`

type Product = "ozaponline" | "legacy_zapgpt"
type PlanType = "vitalicio" | "subscription"

type ConsumerRow = {
  email: string
  product: Product
  planType: PlanType
  events: number
  active: boolean
}

const main = async () => {
  const zapGptUrl = process.env.ZAP_GPT_DATABASE_URL
  const zapAuthUrl = process.env.ZAP_AUTH_DATABASE_URL
  if (!zapGptUrl) throw new Error("ZAP_GPT_DATABASE_URL not set")
  if (!zapAuthUrl) throw new Error("ZAP_AUTH_DATABASE_URL not set")

  const zapgpt = postgres(zapGptUrl, { ssl: { rejectUnauthorized: false }, max: 3 })
  const zapauth = postgres(zapAuthUrl, { ssl: { rejectUnauthorized: false }, max: 3 })

  try {
    const ozaponlineUsers = (await zapgpt`
      SELECT
        u.id::text AS user_id,
        u.email,
        u.access_until,
        CASE
          WHEN u.access_until > NOW() + INTERVAL '5 years' THEN 'vitalicio'
          ELSE 'subscription'
        END AS plan_type,
        COALESCE(msg.cnt, 0)::int AS ai_messages
      FROM users u
      LEFT JOIN (
        SELECT i.user_id, COUNT(*)::int AS cnt
        FROM messages m
        JOIN instances i ON i.id = m.instance_id
        WHERE m.message_type = 'ai_message'
          AND m.timestamp >= NOW() - (INTERVAL '1 day' * ${DAYS_WINDOW})
        GROUP BY i.user_id
      ) msg ON msg.user_id = u.id
      WHERE u.has_ai_access = true
        AND u.access_until > NOW()
        AND EXISTS (SELECT 1 FROM instances i WHERE i.user_id = u.id AND i.agent_id IS NOT NULL)
    `) as unknown as Array<{
      user_id: string
      email: string
      access_until: Date
      plan_type: PlanType
      ai_messages: number
    }>

    const legacyUsers = (await zapauth`
      SELECT
        u.id::text AS user_id,
        u.email,
        u.device_id,
        u.access_until,
        CASE
          WHEN u.access_until > NOW() + INTERVAL '5 years' THEN 'vitalicio'
          ELSE 'subscription'
        END AS plan_type,
        COALESCE(metric.cnt, 0)::int AS oZap_calls
      FROM users u
      LEFT JOIN (
        SELECT device_id, COUNT(*)::int AS cnt
        FROM twin_ai_metrics
        WHERE timestamp >= NOW() - (INTERVAL '1 day' * ${DAYS_WINDOW})
          AND device_id IS NOT NULL
        GROUP BY device_id
      ) metric ON metric.device_id = u.device_id
      WHERE u.access_until > NOW()
    `) as unknown as Array<{
      user_id: string
      email: string
      device_id: string | null
      access_until: Date
      plan_type: PlanType
      ozap_calls: number
    }>

    const totalsAuth = await zapauth`
      SELECT COUNT(*)::int AS total_calls,
             COUNT(DISTINCT device_id)::int AS distinct_devices
      FROM twin_ai_metrics
      WHERE timestamp >= NOW() - (INTERVAL '1 day' * ${DAYS_WINDOW})
    `
    const totalCallsLegacy = Number(totalsAuth[0].total_calls)
    const distinctDevices = Number(totalsAuth[0].distinct_devices)

    const totalsOz = await zapgpt`
      SELECT COUNT(*)::int AS c
      FROM messages m
      JOIN instances i ON i.id = m.instance_id
      JOIN users u ON u.id = i.user_id
      WHERE m.message_type = 'ai_message'
        AND m.timestamp >= NOW() - (INTERVAL '1 day' * ${DAYS_WINDOW})
        AND u.has_ai_access = true
        AND u.access_until > NOW()
        AND i.agent_id IS NOT NULL
    `
    const totalAiMessagesOzaponline = Number(totalsOz[0].c)

    const totalEvents = totalAiMessagesOzaponline + totalCallsLegacy
    const costPerEventUsd = totalEvents > 0 ? TOTAL_AI_COST_USD / totalEvents : 0

    const ozUsedAi = ozaponlineUsers.filter((u) => u.ai_messages > 0)
    const legacyUsedAi = legacyUsers.filter((u) => u.ozap_calls > 0)
    const ozCostUsd = totalAiMessagesOzaponline * costPerEventUsd
    const legacyCostUsd = totalCallsLegacy * costPerEventUsd

    const ozActiveSubs = ozaponlineUsers.filter((u) => u.plan_type === "subscription").length
    const ozActiveVitalicios = ozaponlineUsers.filter((u) => u.plan_type === "vitalicio").length
    const legacyActiveSubs = legacyUsers.filter((u) => u.plan_type === "subscription").length
    const legacyActiveVitalicios = legacyUsers.filter((u) => u.plan_type === "vitalicio").length

    const ozRevenueBrl = ozActiveSubs * ASSUMED_OZAPONLINE_MRR_BRL
    const legacyRevenueBrl = legacyActiveSubs * ASSUMED_LEGACY_MRR_BRL
    const totalRevenueBrl = ozRevenueBrl + legacyRevenueBrl
    const totalCostBrl = (ozCostUsd + legacyCostUsd) * USD_TO_BRL

    const w = "=".repeat(78)
    console.log(w)
    console.log(`AI COST vs REVENUE — last ${DAYS_WINDOW} days`)
    console.log(w)
    console.log(`Total AI cost (you informed): ${fmtUsd(TOTAL_AI_COST_USD)} = ${fmtBrl(TOTAL_AI_COST_USD * USD_TO_BRL)}`)
    console.log(`USD→BRL: ${USD_TO_BRL}`)
    console.log(`Assumed MRR: oZapOnline ${fmtBrl(ASSUMED_OZAPONLINE_MRR_BRL)}/user, Legacy ${fmtBrl(ASSUMED_LEGACY_MRR_BRL)}/user`)
    console.log("")

    console.log("DATA SOURCES:")
    console.log(`  oZapOnline: ozaponline.messages (message_type='ai_message') + instances with agent_id`)
    console.log(`  Legacy:     zap-auth.twin_ai_metrics (oZap AI desktop client logs) joined by device_id`)
    console.log(`  Legacy twin_ai_metrics: ${totalCallsLegacy.toLocaleString()} calls, ${distinctDevices} distinct devices`)
    console.log("")

    console.log("PRODUCT BREAKDOWN:")
    console.log(`  ${"product".padEnd(15)} ${"active".padStart(7)} ${"subs".padStart(6)} ${"vital".padStart(6)} ${"used AI".padStart(8)} ${"events".padStart(10)} ${"cost (BRL)".padStart(12)} ${"share".padStart(7)}`)

    const rowFmt = (
      label: string,
      total: number,
      subs: number,
      vital: number,
      usedAi: number,
      events: number,
      costUsd: number
    ) => {
      const cost = costUsd * USD_TO_BRL
      const share = totalEvents > 0 ? (events / totalEvents) * 100 : 0
      console.log(
        `  ${label.padEnd(15)} ${String(total).padStart(7)} ${String(subs).padStart(6)} ${String(vital).padStart(6)} ${String(usedAi).padStart(8)} ${events.toLocaleString().padStart(10)} ${fmtBrl(cost).padStart(12)} ${(share.toFixed(1) + "%").padStart(7)}`
      )
    }
    rowFmt("oZapOnline", ozaponlineUsers.length, ozActiveSubs, ozActiveVitalicios, ozUsedAi.length, totalAiMessagesOzaponline, ozCostUsd)
    rowFmt("legacy_zapgpt", legacyUsers.length, legacyActiveSubs, legacyActiveVitalicios, legacyUsedAi.length, totalCallsLegacy, legacyCostUsd)
    console.log(`  ${"TOTAL".padEnd(15)} ${String(ozaponlineUsers.length + legacyUsers.length).padStart(7)} ${String(ozActiveSubs + legacyActiveSubs).padStart(6)} ${String(ozActiveVitalicios + legacyActiveVitalicios).padStart(6)} ${String(ozUsedAi.length + legacyUsedAi.length).padStart(8)} ${totalEvents.toLocaleString().padStart(10)} ${fmtBrl(totalCostBrl).padStart(12)}`)
    console.log("")

    console.log("MARGIN ANALYSIS:")
    console.log(`  oZapOnline revenue:   ${fmtBrl(ozRevenueBrl)} (${ozActiveSubs} subs × ${fmtBrl(ASSUMED_OZAPONLINE_MRR_BRL)})`)
    console.log(`  Legacy revenue:       ${fmtBrl(legacyRevenueBrl)} (${legacyActiveSubs} subs × ${fmtBrl(ASSUMED_LEGACY_MRR_BRL)})`)
    console.log(`  Vitalicio (no MRR):   ${ozActiveVitalicios + legacyActiveVitalicios} users (cost only, no recurring)`)
    console.log(`  Total revenue:        ${fmtBrl(totalRevenueBrl)}/mo`)
    console.log(`  Total AI cost:        ${fmtBrl(totalCostBrl)}/mo`)
    console.log(`  Net profit:           ${fmtBrl(totalRevenueBrl - totalCostBrl)}/mo ${totalRevenueBrl - totalCostBrl >= 0 ? "[POSITIVE]" : "[NEGATIVE]"}`)
    console.log("")

    const allConsumers: ConsumerRow[] = [
      ...ozaponlineUsers
        .filter((u) => u.ai_messages > 0)
        .map((u) => ({
          email: u.email,
          product: "ozaponline" as Product,
          planType: u.plan_type,
          events: u.ai_messages,
          active: true,
        })),
      ...legacyUsers
        .filter((u) => u.ozap_calls > 0)
        .map((u) => ({
          email: u.email,
          product: "legacy_zapgpt" as Product,
          planType: u.plan_type,
          events: u.ozap_calls,
          active: true,
        })),
    ].sort((a, b) => b.events - a.events)

    console.log("TOP 20 CONSUMERS:")
    console.log(`  ${"product".padEnd(15)} ${"plan".padEnd(13)} ${"events".padStart(10)} ${"cost (BRL)".padStart(12)}  email`)
    for (const u of allConsumers.slice(0, 20)) {
      const cu = u.events * costPerEventUsd
      const cb = cu * USD_TO_BRL
      console.log(`  ${u.product.padEnd(15)} ${u.planType.padEnd(13)} ${u.events.toLocaleString().padStart(10)} ${fmtBrl(cb).padStart(12)}  ${u.email}`)
    }
    console.log("")

    const negatives = allConsumers
      .map((u) => {
        const costBrl = u.events * costPerEventUsd * USD_TO_BRL
        const mrr = u.planType === "vitalicio"
          ? 0
          : u.product === "ozaponline" ? ASSUMED_OZAPONLINE_MRR_BRL : ASSUMED_LEGACY_MRR_BRL
        return { ...u, costBrl, mrr, net: mrr - costBrl }
      })
      .filter((u) => u.net < 0)
      .sort((a, b) => a.net - b.net)

    if (negatives.length > 0) {
      console.log(`USERS LOSING YOU MONEY (${negatives.length}):`)
      console.log(`  ${"product".padEnd(15)} ${"plan".padEnd(13)} ${"cost".padStart(10)} ${"revenue".padStart(10)} ${"net".padStart(10)}  email`)
      for (const u of negatives.slice(0, 20)) {
        console.log(
          `  ${u.product.padEnd(15)} ${u.planType.padEnd(13)} ${fmtBrl(u.costBrl).padStart(10)} ${fmtBrl(u.mrr).padStart(10)} ${fmtBrl(u.net).padStart(10)}  ${u.email}`
        )
      }
      const totalNet = negatives.reduce((acc, u) => acc + u.net, 0)
      console.log(`  TOTAL bleed from these ${negatives.length} users: ${fmtBrl(totalNet)}/mo`)
      console.log("")
    }

    console.log("CAVEATS:")
    console.log("  - $200 split proportionally to event count (msgs + twin_ai_metrics calls).")
    console.log("    NOT precise: oZapOnline messages may use heavier models than gpt-5-nano.")
    console.log("  - Tokens are 0 in twin_ai_metrics (client logging bug). Real per-event cost unknown.")
    console.log("  - Vitalício users had a one-time payment; here they generate cost only.")
    console.log("  - 'Legacy' = users in zap-auth DB (old desktop client). 'oZapOnline' = new SaaS DB.")
  } finally {
    await zapgpt.end()
    await zapauth.end()
  }
}

main().catch((err) => {
  console.error("Report failed:", err)
  process.exit(1)
})
