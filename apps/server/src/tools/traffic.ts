import { db } from "../db/client.js"
import { pageViews } from "../db/schema.js"
import { sql, eq, and, gte, lte } from "drizzle-orm"

type ToolResult = { content: string; isError?: boolean }

const getTrafficSummary = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string
  const site = input.site as string | undefined

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const siteFilter = site ? sql`AND site = ${site}` : sql``
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_views,
        COUNT(DISTINCT session_id)::int AS unique_sessions,
        COUNT(DISTINCT referrer_source)::int AS source_count,
        COUNT(*) FILTER (WHERE referrer_source = 'direct')::int AS direct_views,
        COUNT(*) FILTER (WHERE referrer_source = 'instagram')::int AS instagram_views,
        COUNT(*) FILTER (WHERE referrer_source = 'google')::int AS google_views,
        COUNT(*) FILTER (WHERE referrer_source = 'facebook')::int AS facebook_views,
        COUNT(*) FILTER (WHERE referrer_source = 'whatsapp')::int AS whatsapp_views
      FROM page_views
      WHERE created_at >= ${startDate}::timestamp
        AND created_at < (${endDate}::date + INTERVAL '1 day')
        ${siteFilter}
    `)

    return { content: JSON.stringify({ period: { start: startDate, end: endDate }, site: site ?? "all", ...rows[0] }) }
  } catch (error) {
    return { content: `Failed: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getTrafficBySource = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string
  const site = input.site as string | undefined

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const siteFilter = site ? sql`AND site = ${site}` : sql``
    const rows = await db.execute(sql`
      SELECT
        referrer_source AS source,
        COUNT(*)::int AS views,
        COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(DISTINCT page_path)::int AS pages_visited
      FROM page_views
      WHERE created_at >= ${startDate}::timestamp
        AND created_at < (${endDate}::date + INTERVAL '1 day')
        ${siteFilter}
      GROUP BY referrer_source
      ORDER BY views DESC
    `)

    return { content: JSON.stringify({ period: { start: startDate, end: endDate }, site: site ?? "all", sources: rows }) }
  } catch (error) {
    return { content: `Failed: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getDailyTraffic = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string
  const site = input.site as string | undefined

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const siteFilter = site ? sql`AND site = ${site}` : sql``
    const rows = await db.execute(sql`
      SELECT
        DATE(created_at) AS date,
        COUNT(*)::int AS views,
        COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(*) FILTER (WHERE referrer_source = 'instagram')::int AS from_instagram,
        COUNT(*) FILTER (WHERE referrer_source = 'google')::int AS from_google,
        COUNT(*) FILTER (WHERE referrer_source = 'direct')::int AS from_direct
      FROM page_views
      WHERE created_at >= ${startDate}::timestamp
        AND created_at < (${endDate}::date + INTERVAL '1 day')
        ${siteFilter}
      GROUP BY DATE(created_at)
      ORDER BY date
    `)

    return { content: JSON.stringify({ period: { start: startDate, end: endDate }, site: site ?? "all", days: rows }) }
  } catch (error) {
    return { content: `Failed: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getUtmBreakdown = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string
  const site = input.site as string | undefined

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const siteFilter = site ? sql`AND site = ${site}` : sql``
    const rows = await db.execute(sql`
      SELECT
        COALESCE(utm_source, 'none') AS utm_source,
        COALESCE(utm_medium, 'none') AS utm_medium,
        COALESCE(utm_campaign, 'none') AS utm_campaign,
        COUNT(*)::int AS views,
        COUNT(DISTINCT session_id)::int AS sessions
      FROM page_views
      WHERE created_at >= ${startDate}::timestamp
        AND created_at < (${endDate}::date + INTERVAL '1 day')
        ${siteFilter}
        AND (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY views DESC
    `)

    return { content: JSON.stringify({ period: { start: startDate, end: endDate }, site: site ?? "all", campaigns: rows }) }
  } catch (error) {
    return { content: `Failed: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getPageBreakdown = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string
  const site = input.site as string | undefined

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const siteFilter = site ? sql`AND site = ${site}` : sql``
    const rows = await db.execute(sql`
      SELECT
        site,
        page_path,
        COUNT(*)::int AS views,
        COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(DISTINCT referrer_source)::int AS source_count
      FROM page_views
      WHERE created_at >= ${startDate}::timestamp
        AND created_at < (${endDate}::date + INTERVAL '1 day')
        ${siteFilter}
      GROUP BY site, page_path
      ORDER BY views DESC
    `)

    return { content: JSON.stringify({ period: { start: startDate, end: endDate }, pages: rows }) }
  } catch (error) {
    return { content: `Failed: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

export const executeTrafficTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    getTrafficSummary,
    getTrafficBySource,
    getDailyTraffic,
    getUtmBreakdown,
    getPageBreakdown,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown traffic tool: ${toolName}`, isError: true }

  return handler(input)
}
