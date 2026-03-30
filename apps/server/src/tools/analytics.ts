import { zapGptQuery } from "../integrations/zapgpt-db.js"

type ToolResult = { content: string; isError?: boolean }

const getUsageSummary = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const rows = await zapGptQuery((sql) => sql`
      SELECT
        COUNT(*)::int AS total_messages,
        COUNT(*) FILTER (WHERE m.message_type = 'ai_message')::int AS ai_messages,
        COUNT(DISTINCT u.id)::int AS unique_users,
        COUNT(DISTINCT m.instance_id)::int AS active_instances,
        COUNT(*) FILTER (WHERE m.message_type = 'ai_message')::int AS type_ai_message,
        COUNT(*) FILTER (WHERE m.message_type = 'lead_message')::int AS type_lead_message,
        COUNT(*) FILTER (WHERE m.message_type = 'user_message')::int AS type_user_message,
        COUNT(*) FILTER (WHERE m.message_type = 'follow_up')::int AS type_follow_up
      FROM messages m
      JOIN instances i ON i.id = m.instance_id
      JOIN users u ON u.id = i.user_id
      WHERE m.timestamp >= ${startDate}::timestamp
        AND m.timestamp < (${endDate}::date + INTERVAL '1 day')
    `)

    const stats = rows[0]

    return {
      content: JSON.stringify({
        period: { start: startDate, end: endDate },
        totalMessages: stats.total_messages,
        aiMessages: stats.ai_messages,
        uniqueUsers: stats.unique_users,
        activeInstances: stats.active_instances,
        byMessageType: {
          ai_message: stats.type_ai_message,
          lead_message: stats.type_lead_message,
          user_message: stats.type_user_message,
          follow_up: stats.type_follow_up,
        },
      }),
    }
  } catch (error) {
    return { content: `Failed to get usage summary: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getTopUsers = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string
  const limit = (input.limit as number) ?? 10

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const users = await zapGptQuery((sql) => sql`
      SELECT
        u.id AS user_id,
        u.email,
        u.name,
        u.use_system_ai_keys,
        u.has_ai_access,
        COUNT(m.id)::int AS ai_message_count,
        COUNT(DISTINCT m.instance_id)::int AS instance_count
      FROM messages m
      JOIN instances i ON i.id = m.instance_id
      JOIN users u ON u.id = i.user_id
      WHERE m.message_type = 'ai_message'
        AND m.timestamp >= ${startDate}::timestamp
        AND m.timestamp < (${endDate}::date + INTERVAL '1 day')
      GROUP BY u.id, u.email, u.name, u.use_system_ai_keys, u.has_ai_access
      ORDER BY ai_message_count DESC
      LIMIT ${limit}
    `)

    return {
      content: JSON.stringify({
        period: { start: startDate, end: endDate },
        users: users.map((u) => ({
          userId: u.user_id,
          email: u.email,
          name: u.name,
          aiMessageCount: u.ai_message_count,
          instanceCount: u.instance_count,
          useSystemKeys: u.use_system_ai_keys,
          hasAiAccess: u.has_ai_access,
        })),
      }),
    }
  } catch (error) {
    return { content: `Failed to get top users: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getUserUsageDetail = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const userEmail = input.userEmail as string

  if (!userEmail) {
    return { content: "userEmail is required", isError: true }
  }

  try {
    const userRows = await zapGptQuery((sql) => sql`
      SELECT id, email, name, is_active, access_until, has_ai_access,
             use_system_ai_keys, gpt_5_2_enabled, role
      FROM users WHERE email = ${userEmail}
    `)

    const user = userRows[0]
    if (!user) {
      return { content: `User with email "${userEmail}" not found`, isError: true }
    }

    const usageRows = await zapGptQuery((sql) => sql`
      SELECT
        COUNT(m.id)::int AS total_messages,
        COUNT(m.id) FILTER (WHERE m.message_type = 'ai_message')::int AS ai_messages,
        COUNT(m.id) FILTER (
          WHERE m.message_type = 'ai_message'
            AND m.timestamp >= NOW() - INTERVAL '30 days'
        )::int AS last_30_days_ai_messages
      FROM messages m
      JOIN instances i ON i.id = m.instance_id
      WHERE i.user_id = ${user.id}
    `)

    const instances = await zapGptQuery((sql) => sql`
      SELECT id, name, connected, platform, is_enabled
      FROM instances WHERE user_id = ${user.id}
    `)

    const modelUsage = await zapGptQuery((sql) => sql`
      SELECT
        model_used AS model,
        COUNT(*)::int AS count,
        ROUND(AVG(processing_duration_ms))::int AS avg_duration_ms
      FROM twin_interactions
      WHERE user_id = ${user.id}
      GROUP BY model_used
      ORDER BY count DESC
    `)

    const usage = usageRows[0]

    return {
      content: JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isActive: user.is_active,
          accessUntil: user.access_until,
          hasAiAccess: user.has_ai_access,
          useSystemKeys: user.use_system_ai_keys,
          gpt52Enabled: user.gpt_5_2_enabled,
        },
        usage: {
          totalMessages: usage.total_messages,
          aiMessages: usage.ai_messages,
          last30DaysAiMessages: usage.last_30_days_ai_messages,
        },
        instances: instances.map((inst) => ({
          id: inst.id,
          name: inst.name,
          connected: inst.connected,
          platform: inst.platform,
          isEnabled: inst.is_enabled,
        })),
        modelUsage: modelUsage.map((m) => ({
          model: m.model,
          count: m.count,
          avgDurationMs: m.avg_duration_ms,
        })),
      }),
    }
  } catch (error) {
    return { content: `Failed to get user usage detail: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getDailyUsageTrend = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const days = await zapGptQuery((sql) => sql`
      SELECT
        DATE(m.timestamp) AS date,
        COUNT(*)::int AS total_messages,
        COUNT(*) FILTER (WHERE m.message_type = 'ai_message')::int AS ai_messages,
        COUNT(DISTINCT u.id)::int AS unique_users
      FROM messages m
      JOIN instances i ON i.id = m.instance_id
      JOIN users u ON u.id = i.user_id
      WHERE m.timestamp >= ${startDate}::timestamp
        AND m.timestamp < (${endDate}::date + INTERVAL '1 day')
      GROUP BY DATE(m.timestamp)
      ORDER BY date
    `)

    return {
      content: JSON.stringify({
        period: { start: startDate, end: endDate },
        days: days.map((d) => ({
          date: d.date,
          totalMessages: d.total_messages,
          aiMessages: d.ai_messages,
          uniqueUsers: d.unique_users,
        })),
      }),
    }
  } catch (error) {
    return { content: `Failed to get daily usage trend: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getModelUsageBreakdown = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const models = await zapGptQuery((sql) => sql`
      SELECT
        model_used AS model,
        COUNT(*)::int AS interaction_count,
        ROUND(AVG(processing_duration_ms))::int AS avg_duration_ms,
        ROUND(
          COUNT(*) FILTER (WHERE status = 'error')::numeric / NULLIF(COUNT(*), 0), 3
        )::float AS error_rate
      FROM twin_interactions
      WHERE created_at >= ${startDate}::timestamp
        AND created_at < (${endDate}::date + INTERVAL '1 day')
      GROUP BY model_used
      ORDER BY interaction_count DESC
    `)

    return {
      content: JSON.stringify({
        period: { start: startDate, end: endDate },
        models: models.map((m) => ({
          model: m.model,
          interactionCount: m.interaction_count,
          avgDurationMs: m.avg_duration_ms,
          errorRate: m.error_rate ?? 0,
        })),
      }),
    }
  } catch (error) {
    return { content: `Failed to get model usage breakdown: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getSystemKeyUsers = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const activeOnly = (input.activeOnly as boolean) ?? true

  try {
    const users = await zapGptQuery((sql) => {
      const activeFilter = activeOnly ? sql`AND u.is_active = true` : sql``
      return sql`
        SELECT
          u.id AS user_id,
          u.email,
          u.name,
          u.is_active,
          u.access_until,
          u.gpt_5_2_enabled,
          COUNT(DISTINCT i.id)::int AS instance_count,
          COALESCE(msg.ai_count, 0)::int AS last_30_days_ai_messages
        FROM users u
        LEFT JOIN instances i ON i.user_id = u.id
        LEFT JOIN (
          SELECT i2.user_id, COUNT(*)::int AS ai_count
          FROM messages m
          JOIN instances i2 ON i2.id = m.instance_id
          WHERE m.message_type = 'ai_message'
            AND m.timestamp >= NOW() - INTERVAL '30 days'
          GROUP BY i2.user_id
        ) msg ON msg.user_id = u.id
        WHERE u.use_system_ai_keys = true
          ${activeFilter}
        GROUP BY u.id, u.email, u.name, u.is_active, u.access_until,
                 u.gpt_5_2_enabled, msg.ai_count
        ORDER BY last_30_days_ai_messages DESC
      `
    })

    return {
      content: JSON.stringify({
        totalSystemKeyUsers: users.length,
        users: users.map((u) => ({
          userId: u.user_id,
          email: u.email,
          name: u.name,
          isActive: u.is_active,
          accessUntil: u.access_until,
          gpt52Enabled: u.gpt_5_2_enabled,
          instanceCount: u.instance_count,
          last30DaysAiMessages: u.last_30_days_ai_messages,
        })),
      }),
    }
  } catch (error) {
    return { content: `Failed to get system key users: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getTwinInteractionStats = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string
  const userId = input.userId as string | undefined

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const totalsRows = await zapGptQuery((sql) => {
      const userFilter = userId ? sql`AND user_id = ${userId}` : sql``
      return sql`
        SELECT
          COUNT(*)::int AS total_interactions,
          ROUND(AVG(processing_duration_ms))::int AS avg_processing_duration_ms,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'error')::numeric / NULLIF(COUNT(*), 0), 3
          )::float AS error_rate
        FROM twin_interactions
        WHERE created_at >= ${startDate}::timestamp
          AND created_at < (${endDate}::date + INTERVAL '1 day')
          ${userFilter}
      `
    })

    const byModel = await zapGptQuery((sql) => {
      const userFilter = userId ? sql`AND user_id = ${userId}` : sql``
      return sql`
        SELECT model_used AS model, COUNT(*)::int AS count
        FROM twin_interactions
        WHERE created_at >= ${startDate}::timestamp
          AND created_at < (${endDate}::date + INTERVAL '1 day')
          ${userFilter}
        GROUP BY model_used
        ORDER BY count DESC
      `
    })

    const byStatusRows = await zapGptQuery((sql) => {
      const userFilter = userId ? sql`AND user_id = ${userId}` : sql``
      return sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'success')::int AS success,
          COUNT(*) FILTER (WHERE status = 'error')::int AS error,
          COUNT(*) FILTER (WHERE status = 'partial')::int AS partial
        FROM twin_interactions
        WHERE created_at >= ${startDate}::timestamp
          AND created_at < (${endDate}::date + INTERVAL '1 day')
          ${userFilter}
      `
    })

    const totals = totalsRows[0]
    const byStatus = byStatusRows[0]

    return {
      content: JSON.stringify({
        period: { start: startDate, end: endDate },
        totalInteractions: totals.total_interactions,
        byModel: byModel.map((m) => ({ model: m.model, count: m.count })),
        byStatus: {
          success: byStatus.success,
          error: byStatus.error,
          partial: byStatus.partial,
        },
        avgProcessingDurationMs: totals.avg_processing_duration_ms,
        errorRate: totals.error_rate ?? 0,
      }),
    }
  } catch (error) {
    return { content: `Failed to get twin interaction stats: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const getInstanceUsageBreakdown = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string
  const limit = (input.limit as number) ?? 10

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const instances = await zapGptQuery((sql) => sql`
      SELECT
        i.id AS instance_id,
        i.name AS instance_name,
        i.platform,
        u.email AS owner_email,
        u.name AS owner_name,
        u.use_system_ai_keys,
        COUNT(m.id)::int AS ai_message_count
      FROM messages m
      JOIN instances i ON i.id = m.instance_id
      JOIN users u ON u.id = i.user_id
      WHERE m.message_type = 'ai_message'
        AND m.timestamp >= ${startDate}::timestamp
        AND m.timestamp < (${endDate}::date + INTERVAL '1 day')
      GROUP BY i.id, i.name, i.platform, u.email, u.name, u.use_system_ai_keys
      ORDER BY ai_message_count DESC
      LIMIT ${limit}
    `)

    return {
      content: JSON.stringify({
        period: { start: startDate, end: endDate },
        instances: instances.map((inst) => ({
          instanceId: inst.instance_id,
          instanceName: inst.instance_name,
          platform: inst.platform,
          aiMessageCount: inst.ai_message_count,
          ownerEmail: inst.owner_email,
          ownerName: inst.owner_name,
          useSystemKeys: inst.use_system_ai_keys,
        })),
      }),
    }
  } catch (error) {
    return { content: `Failed to get instance usage breakdown: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

export const executeAnalyticsTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    getUsageSummary,
    getTopUsers,
    getUserUsageDetail,
    getDailyUsageTrend,
    getModelUsageBreakdown,
    getSystemKeyUsers,
    getTwinInteractionStats,
    getInstanceUsageBreakdown,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown analytics tool: ${toolName}`, isError: true }

  return handler(input)
}
