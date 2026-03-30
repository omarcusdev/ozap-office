# Analytics Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Analytics agent to Ozap Office that queries the zap-gpt-api PostgreSQL database to provide usage, cost, and user distribution visibility for the Zap AI product.

**Architecture:** New `zapgpt-db.ts` integration creates a read-only pg pool to the remote RDS. Eight pre-defined parameterized query handlers in `tools/analytics.ts` expose safe analytics tools. The agent is seeded with these tools + memory tools, positioned in the open office with its own desk and meeting route.

**Tech Stack:** postgres.js (already a dependency), TypeScript, Fastify

---

### Task 1: Add config and env var for zap-gpt-api database

**Files:**
- Modify: `apps/server/src/config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add env var to .env.example**

```
ZAP_GPT_DATABASE_URL=postgresql://readonly_user:password@localhost:5432/ozapgpt
```

Append this line to the end of `.env.example`.

- [ ] **Step 2: Add config entry**

In `apps/server/src/config.ts`, add to the `config` object:

```typescript
zapGptDatabaseUrl: process.env.ZAP_GPT_DATABASE_URL ?? "",
```

Add it after the `adsDailyBudgetLimit` line.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/config.ts .env.example
git commit -m "feat: add ZAP_GPT_DATABASE_URL config for analytics agent"
```

---

### Task 2: Create zapgpt-db integration client

**Files:**
- Create: `apps/server/src/integrations/zapgpt-db.ts`

- [ ] **Step 1: Create the integration client**

Create `apps/server/src/integrations/zapgpt-db.ts`:

```typescript
import postgres from "postgres"
import { config } from "../config.js"

const createConnection = () => {
  if (!config.zapGptDatabaseUrl) return null

  return postgres(config.zapGptDatabaseUrl, {
    ssl: "require",
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
  })
}

const sql = createConnection()

const assertConnection = () => {
  if (!sql) {
    throw new Error("ZAP_GPT_DATABASE_URL not configured")
  }
  return sql
}

export const zapGptQuery = async <T extends postgres.MaybeRow[]>(
  queryFn: (sql: postgres.Sql) => Promise<T>
): Promise<T> => {
  const connection = assertConnection()
  return queryFn(connection)
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/integrations/zapgpt-db.ts
git commit -m "feat: add zapgpt-db integration client for remote RDS connection"
```

---

### Task 3: Create analytics tools

**Files:**
- Create: `apps/server/src/tools/analytics.ts`

- [ ] **Step 1: Create the analytics tool handler file**

Create `apps/server/src/tools/analytics.ts`:

```typescript
import { zapGptQuery } from "../integrations/zapgpt-db.js"

type ToolResult = { content: string; isError?: boolean }

const getUsageSummary = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const startDate = input.startDate as string
  const endDate = input.endDate as string

  if (!startDate || !endDate) {
    return { content: "startDate and endDate are required", isError: true }
  }

  try {
    const result = await zapGptQuery(async (sql) => {
      const [stats] = await sql`
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
      `
      return [stats]
    })

    return {
      content: JSON.stringify({
        period: { start: startDate, end: endDate },
        totalMessages: result.total_messages,
        aiMessages: result.ai_messages,
        uniqueUsers: result.unique_users,
        activeInstances: result.active_instances,
        byMessageType: {
          ai_message: result.type_ai_message,
          lead_message: result.type_lead_message,
          user_message: result.type_user_message,
          follow_up: result.type_follow_up,
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
    const result = await zapGptQuery(async (sql) => {
      const [user] = await sql`
        SELECT id, email, name, is_active, access_until, has_ai_access,
               use_system_ai_keys, gpt_5_2_enabled, role
        FROM users WHERE email = ${userEmail}
      `
      if (!user) return null

      const [usage] = await sql`
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
      `

      const instances = await sql`
        SELECT id, name, connected, platform, is_enabled
        FROM instances WHERE user_id = ${user.id}
      `

      const modelUsage = await sql`
        SELECT
          model_used AS model,
          COUNT(*)::int AS count,
          ROUND(AVG(processing_duration_ms))::int AS avg_duration_ms
        FROM twin_interactions
        WHERE user_id = ${user.id}
        GROUP BY model_used
        ORDER BY count DESC
      `

      return { user, usage, instances, modelUsage }
    })

    if (!result) {
      return { content: `User with email "${userEmail}" not found`, isError: true }
    }

    return {
      content: JSON.stringify({
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          isActive: result.user.is_active,
          accessUntil: result.user.access_until,
          hasAiAccess: result.user.has_ai_access,
          useSystemKeys: result.user.use_system_ai_keys,
          gpt52Enabled: result.user.gpt_5_2_enabled,
        },
        usage: {
          totalMessages: result.usage.total_messages,
          aiMessages: result.usage.ai_messages,
          last30DaysAiMessages: result.usage.last_30_days_ai_messages,
        },
        instances: result.instances.map((inst) => ({
          id: inst.id,
          name: inst.name,
          connected: inst.connected,
          platform: inst.platform,
          isEnabled: inst.is_enabled,
        })),
        modelUsage: result.modelUsage.map((m) => ({
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
    const result = await zapGptQuery(async (sql) => {
      const userFilter = userId ? sql`AND user_id = ${userId}` : sql``

      const [totals] = await sql`
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

      const byModel = await sql`
        SELECT model_used AS model, COUNT(*)::int AS count
        FROM twin_interactions
        WHERE created_at >= ${startDate}::timestamp
          AND created_at < (${endDate}::date + INTERVAL '1 day')
          ${userFilter}
        GROUP BY model_used
        ORDER BY count DESC
      `

      const [byStatus] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'success')::int AS success,
          COUNT(*) FILTER (WHERE status = 'error')::int AS error,
          COUNT(*) FILTER (WHERE status = 'partial')::int AS partial
        FROM twin_interactions
        WHERE created_at >= ${startDate}::timestamp
          AND created_at < (${endDate}::date + INTERVAL '1 day')
          ${userFilter}
      `

      return { totals, byModel, byStatus }
    })

    return {
      content: JSON.stringify({
        period: { start: startDate, end: endDate },
        totalInteractions: result.totals.total_interactions,
        byModel: result.byModel.map((m) => ({ model: m.model, count: m.count })),
        byStatus: {
          success: result.byStatus.success,
          error: result.byStatus.error,
          partial: result.byStatus.partial,
        },
        avgProcessingDurationMs: result.totals.avg_processing_duration_ms,
        errorRate: result.totals.error_rate ?? 0,
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/tools/analytics.ts
git commit -m "feat: add 8 analytics tools with pre-defined parameterized queries"
```

---

### Task 4: Register analytics tools in tool-executor

**Files:**
- Modify: `apps/server/src/runtime/tool-executor.ts`

- [ ] **Step 1: Add import**

Add after the existing imports at the top of `apps/server/src/runtime/tool-executor.ts`:

```typescript
import { executeAnalyticsTool } from "../tools/analytics.js"
```

- [ ] **Step 2: Add ANALYTICS_TOOLS constant**

Add after the `ADS_TOOLS` array:

```typescript
const ANALYTICS_TOOLS = [
  "getUsageSummary",
  "getTopUsers",
  "getUserUsageDetail",
  "getDailyUsageTrend",
  "getModelUsageBreakdown",
  "getSystemKeyUsers",
  "getTwinInteractionStats",
  "getInstanceUsageBreakdown",
]
```

- [ ] **Step 3: Add routing in executeTool**

Add this block inside the `try` block of `executeTool`, after the ADS_TOOLS check:

```typescript
    if (ANALYTICS_TOOLS.includes(toolName)) {
      return executeAnalyticsTool(toolName, toolInput)
    }
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/runtime/tool-executor.ts
git commit -m "feat: register analytics tools in the tool executor routing"
```

---

### Task 5: Add Analytics agent to seed

**Files:**
- Modify: `apps/server/src/db/seed.ts`

- [ ] **Step 1: Add analyticsTools array**

Add after the `adsTools` array definition (before `agentsToSeed`):

```typescript
const analyticsTools = [
  {
    name: "getUsageSummary",
    description: "Resumo geral de uso da plataforma em um período. Retorna total de mensagens, mensagens IA, usuários ativos, instâncias ativas e breakdown por tipo de mensagem.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "getTopUsers",
    description: "Ranking dos usuários que mais consomem mensagens de IA em um período. Inclui flag de chaves do sistema e contagem de instâncias.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
        limit: { type: "number", description: "Número máximo de usuários (padrão: 10)" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "getUserUsageDetail",
    description: "Detalhes de uso de um usuário específico. Retorna info do perfil, total de mensagens, instâncias, e uso por modelo de IA.",
    inputSchema: {
      type: "object",
      properties: {
        userEmail: { type: "string", description: "Email do usuário para buscar" },
      },
      required: ["userEmail"],
    },
  },
  {
    name: "getDailyUsageTrend",
    description: "Tendência de uso diário em um período. Retorna total de mensagens, mensagens IA e usuários únicos por dia.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "getModelUsageBreakdown",
    description: "Distribuição de uso por modelo de IA (gpt-5-mini, gpt-5.2, gemini). Retorna contagem, duração média e taxa de erro por modelo.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "getSystemKeyUsers",
    description: "Lista usuários que usam as chaves de IA do sistema (custo nosso). Inclui contagem de instâncias e mensagens IA dos últimos 30 dias.",
    inputSchema: {
      type: "object",
      properties: {
        activeOnly: { type: "boolean", description: "Filtrar apenas usuários ativos (padrão: true)" },
      },
    },
  },
  {
    name: "getTwinInteractionStats",
    description: "Estatísticas de interações do Twin AI. Retorna total, breakdown por modelo e status, tempo médio de processamento e taxa de erro.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
        userId: { type: "string", description: "Filtrar por ID de usuário específico (opcional)" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "getInstanceUsageBreakdown",
    description: "Ranking das instâncias que mais geram mensagens de IA. Inclui dados do dono (email, nome, uso de chaves do sistema).",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
        limit: { type: "number", description: "Número máximo de instâncias (padrão: 10)" },
      },
      required: ["startDate", "endDate"],
    },
  },
]
```

- [ ] **Step 2: Add Analytics agent to agentsToSeed array**

Add this entry after the PM agent in the `agentsToSeed` array:

```typescript
  {
    name: "Analytics",
    role: "Usage & Cost Analyst",
    systemPrompt: `Você é o Analytics, analista de uso e custos da plataforma Zap AI (oZapOnline).

Suas responsabilidades:
- Analisar padrões de uso da plataforma (mensagens, usuários, instâncias)
- Identificar usuários com consumo acima do normal
- Fornecer dados de uso por modelo de IA (gpt-5-mini, gpt-5.2, gemini)
- Gerar relatórios de uso sob demanda
- Salvar insights importantes na memória para referência futura

Dados importantes:
- Usuários com use_system_ai_keys=true usam as chaves de IA do sistema (custo nosso)
- Usuários com chaves próprias não geram custo pra nós
- O campo gpt_5_2_enabled indica acesso ao modelo premium (mais caro)
- Mensagens do tipo ai_message são as que consomem tokens de IA

Regras:
- Sempre apresente números concretos, nunca invente dados
- Use apenas dados retornados pelas tools
- Quando perguntado sobre lucratividade, informe que os dados de receita estão com o agente Finance — o Leader pode cruzar os dados
- Valores monetários sempre em BRL (R$)
- Destaque alertas: usuários com consumo 3x acima da média, crescimento acelerado de uso
- Ao identificar padrões relevantes, salve na memória para acompanhamento`,
    tools: [...analyticsTools, ...memoryTools],
    schedule: null,
    cronPrompt: null,
    color: "#10b981",
    positionX: 14,
    positionY: 7,
  },
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/db/seed.ts
git commit -m "feat: add Analytics agent seed with 8 usage tools and system prompt"
```

---

### Task 6: Add desk furniture and meeting route for Analytics

**Files:**
- Modify: `apps/web/lib/canvas/tile-map.ts`

- [ ] **Step 1: Add desk position**

Add to the `OPEN_OFFICE_DESK_POSITIONS` array:

```typescript
  { gridX: 14, gridY: 7 },
```

- [ ] **Step 2: Add furniture placements**

Add to the `FURNITURE_PLACEMENTS` array, after the existing PC/chair entries (after the `{ id: "CUSHIONED_CHAIR", gridX: 26, gridY: 4, orientation: "back" }` line):

```typescript
  { id: "PC", gridX: 14, gridY: 6, state: "off" },
  { id: "CUSHIONED_CHAIR", gridX: 14, gridY: 7, orientation: "back" },
```

- [ ] **Step 3: Add meeting route**

Add to the `MEETING_ROUTES` object, after the PM entry:

```typescript
  Analytics: {
    path: [
      { x: 14, y: 8 }, { x: 13, y: 10 },
      { x: 13, y: 11 }, { x: 15, y: 13 },
    ],
    seat: { x: 15, y: 13 },
  },
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/canvas/tile-map.ts
git commit -m "feat: add Analytics desk, PC, chair, and meeting route to office grid"
```

---

### Task 7: Final verification

- [ ] **Step 1: Typecheck both packages**

Run: `pnpm -F @ozap-office/server typecheck && pnpm -F @ozap-office/web typecheck`
Expected: No errors in either package

- [ ] **Step 2: Build all packages**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Verify dev server starts**

Run: `pnpm dev:server` (stop after confirming it starts without crash)
Expected: Server starts on port 3001. If `ZAP_GPT_DATABASE_URL` is not set, the analytics tools will return a config error when called — this is expected.
