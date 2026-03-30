# Analytics Agent — Usage & Cost Analyst

## Summary

New Ozap Office agent that connects directly to the zap-gpt-api PostgreSQL database (AWS RDS) to provide visibility into AI usage, token consumption, user distribution, and cost analysis for the Zap AI product. All queries are pre-defined and parameterized — no dynamic SQL.

## Problem

The Zap AI product (oZapOnline com IA) uses system OpenAI credits paid by the business owner, but there is no visibility into:
- Which users consume the most AI resources
- Whether usage is concentrated in a few users or spread across many
- Whether the revenue from subscriptions covers the AI costs
- Usage trends and growth patterns

## Architecture

```
User asks about costs/usage
    ↓
Leader delegates to Analytics
    ↓
Analytics → pre-defined queries → zap-gpt-api RDS
    ↓
Leader (if profitability needed) → delegates to Finance
    ↓
Finance → Cakto API (revenue per user)
    ↓
Leader correlates usage + revenue → responds
```

### Components

**New files:**
1. `apps/server/src/integrations/zapgpt-db.ts` — pg pool connection to zap-gpt-api RDS
2. `apps/server/src/tools/analytics.ts` — 8 tool handlers with pre-defined queries

**Modified files:**
1. `apps/server/src/config.ts` — add `zapGptDatabaseUrl`
2. `apps/server/src/runtime/tool-executor.ts` — register analytics tools
3. `apps/server/src/db/seed.ts` — add Analytics agent definition
4. `.env.example` — add `ZAP_GPT_DATABASE_URL`

## Database Connection

### Integration Client (`integrations/zapgpt-db.ts`)

Uses the `postgres` package (already a project dependency) to create a read-only pool to the zap-gpt-api RDS instance.

- Connection string from `ZAP_GPT_DATABASE_URL` env var
- Pool max connections: 5 (low to avoid impacting the RDS)
- Idle timeout: 30 seconds
- SSL enabled (RDS requires it)

### Target Database Schema (relevant tables)

**`users`** — user accounts
- `id` (UUID), `email`, `name`, `is_active`, `access_until`, `has_ai_access`, `use_system_ai_keys`, `gpt_5_2_enabled`, `instances` (allowed count), `role`, `created_at`

**`instances`** — WhatsApp bot instances per user
- `id`, `user_id` (FK → users), `name`, `agent_id`, `connected`, `is_enabled`, `platform`, `created_at`

**`messages`** — individual messages
- `id`, `chat_id`, `instance_id` (FK → instances), `message_type` (ai_message|follow_up|lead_message|user_message), `media_type`, `timestamp`, `content`

**`chats`** — conversation threads
- `id`, `chat_id`, `instance_id` (FK → instances), `name`, `ai_message` (boolean), `lead_status`, `created_at`

**`twin_interactions`** — detailed AI interaction logs
- `id`, `user_id` (FK → users), `model_used`, `processing_duration_ms`, `status` (success|error|partial), `created_at`

**`twin_tool_executions`** — tool calls within Twin interactions
- `id`, `interaction_id` (FK → twin_interactions), `tool_name`, `execution_duration_ms`, `success`

## Tool Definitions

All tools receive typed parameters and return JSON strings. Dates are always `YYYY-MM-DD`.

### 1. `getUsageSummary`

**Params:** `startDate` (required), `endDate` (required)

**Query logic:**
- Count total messages in period (from `messages` table, joined with `instances` to scope)
- Count AI messages (`message_type = 'ai_message'`)
- Count distinct active users (via instances → users join)
- Count distinct active instances
- Breakdown by `message_type`

**Returns:**
```json
{
  "period": { "start": "2026-03-01", "end": "2026-03-30" },
  "totalMessages": 15420,
  "aiMessages": 8230,
  "uniqueUsers": 45,
  "activeInstances": 62,
  "byMessageType": {
    "ai_message": 8230,
    "lead_message": 5100,
    "user_message": 1800,
    "follow_up": 290
  }
}
```

### 2. `getTopUsers`

**Params:** `startDate` (required), `endDate` (required), `limit` (default 10)

**Query logic:**
- Join messages → instances → users
- Filter `message_type = 'ai_message'` in date range
- Group by user, count AI messages, count instances
- Order by AI message count descending
- Include `use_system_ai_keys` flag

**Returns:**
```json
{
  "period": { "start": "...", "end": "..." },
  "users": [
    {
      "userId": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "aiMessageCount": 1250,
      "instanceCount": 3,
      "useSystemKeys": true,
      "hasAiAccess": true
    }
  ]
}
```

### 3. `getUserUsageDetail`

**Params:** `userEmail` (required)

**Query logic:**
- Find user by email
- Get user flags: `has_ai_access`, `use_system_ai_keys`, `gpt_5_2_enabled`, `access_until`, `is_active`
- Count total messages and AI messages (all time + last 30 days)
- List instances with name and connected status
- Get model usage from `twin_interactions` (group by `model_used`)

**Returns:**
```json
{
  "user": {
    "id": "uuid",
    "email": "...",
    "name": "...",
    "isActive": true,
    "accessUntil": "2026-06-01",
    "hasAiAccess": true,
    "useSystemKeys": true,
    "gpt52Enabled": false
  },
  "usage": {
    "totalMessages": 3200,
    "aiMessages": 1800,
    "last30DaysAiMessages": 450
  },
  "instances": [
    { "id": 1, "name": "Bot Principal", "connected": true, "platform": "whatsapp" }
  ],
  "modelUsage": [
    { "model": "gpt-5-mini", "count": 120, "avgDurationMs": 1500 }
  ]
}
```

### 4. `getDailyUsageTrend`

**Params:** `startDate` (required), `endDate` (required)

**Query logic:**
- Group messages by date (truncate timestamp to day)
- Count total and AI messages per day
- Count distinct users per day (via instances join)

**Returns:**
```json
{
  "period": { "start": "...", "end": "..." },
  "days": [
    { "date": "2026-03-01", "totalMessages": 520, "aiMessages": 280, "uniqueUsers": 32 }
  ]
}
```

### 5. `getModelUsageBreakdown`

**Params:** `startDate` (required), `endDate` (required)

**Query logic:**
- Query `twin_interactions` grouped by `model_used`
- Count interactions, average `processing_duration_ms`
- Calculate error rate (status = 'error' / total)

**Returns:**
```json
{
  "period": { "start": "...", "end": "..." },
  "models": [
    {
      "model": "gpt-5-mini",
      "interactionCount": 5200,
      "avgDurationMs": 1450,
      "errorRate": 0.02
    },
    {
      "model": "gpt-5.2",
      "interactionCount": 320,
      "avgDurationMs": 2100,
      "errorRate": 0.01
    }
  ]
}
```

### 6. `getSystemKeyUsers`

**Params:** `activeOnly` (boolean, default true)

**Query logic:**
- Select users where `use_system_ai_keys = true`
- Optionally filter `is_active = true`
- For each user, count instances and AI messages in last 30 days
- Order by recent AI message count descending

**Returns:**
```json
{
  "totalSystemKeyUsers": 28,
  "users": [
    {
      "userId": "uuid",
      "email": "...",
      "name": "...",
      "isActive": true,
      "accessUntil": "2026-06-01",
      "gpt52Enabled": false,
      "instanceCount": 2,
      "last30DaysAiMessages": 450
    }
  ]
}
```

### 7. `getTwinInteractionStats`

**Params:** `startDate` (required), `endDate` (required), `userId` (optional)

**Query logic:**
- Query `twin_interactions` in date range, optionally filtered by `user_id`
- Total count, group by `model_used`, group by `status`
- Average `processing_duration_ms`
- Error rate overall

**Returns:**
```json
{
  "period": { "start": "...", "end": "..." },
  "totalInteractions": 5520,
  "byModel": [
    { "model": "gpt-5-mini", "count": 5200 },
    { "model": "gemini", "count": 320 }
  ],
  "byStatus": {
    "success": 5400,
    "error": 80,
    "partial": 40
  },
  "avgProcessingDurationMs": 1520,
  "errorRate": 0.014
}
```

### 8. `getInstanceUsageBreakdown`

**Params:** `startDate` (required), `endDate` (required), `limit` (default 10)

**Query logic:**
- Join messages → instances → users
- Filter AI messages in date range
- Group by instance, count AI messages
- Include owner user info (email, name, use_system_keys)
- Order by AI message count descending

**Returns:**
```json
{
  "period": { "start": "...", "end": "..." },
  "instances": [
    {
      "instanceId": 42,
      "instanceName": "Bot Vendas",
      "platform": "whatsapp",
      "aiMessageCount": 890,
      "ownerEmail": "user@example.com",
      "ownerName": "User Name",
      "useSystemKeys": true
    }
  ]
}
```

## Agent Configuration

- **Name:** Analytics
- **Role:** Usage & Cost Analyst
- **Color:** `#10b981` (emerald green)
- **Position:** `positionX: 5, positionY: 2` (next to Leader in the office grid)
- **Schedule:** none (on-demand only)
- **Tools:** 8 analytics tools + 4 memory tools

### System Prompt (Portuguese)

```
Voce e o Analytics, analista de uso e custos da plataforma Zap AI (oZapOnline).

Suas responsabilidades:
- Analisar padroes de uso da plataforma (mensagens, usuarios, instancias)
- Identificar usuarios com consumo acima do normal
- Fornecer dados de uso por modelo de IA (gpt-5-mini, gpt-5.2, gemini)
- Gerar relatorios de uso sob demanda
- Salvar insights importantes na memoria para referencia futura

Dados importantes:
- Usuarios com use_system_ai_keys=true usam as chaves de IA do sistema (custo nosso)
- Usuarios com chaves proprias nao geram custo pra nos
- O campo gpt_5_2_enabled indica acesso ao modelo premium (mais caro)
- Mensagens do tipo ai_message sao as que consomem tokens de IA

Regras:
- Sempre apresente numeros concretos, nunca invente dados
- Use apenas dados retornados pelas tools
- Quando perguntado sobre lucratividade, informe que os dados de receita estao com o agente Finance — o Leader pode cruzar os dados
- Valores monetarios sempre em BRL (R$)
- Destaque alertas: usuarios com consumo 3x acima da media, crescimento acelerado de uso
- Ao identificar padroes relevantes, salve na memoria para acompanhamento
```

## Security

- Database connection is read-only (use a PostgreSQL user with SELECT-only permissions)
- All queries are pre-defined with parameterized inputs
- No dynamic SQL or string interpolation
- Pool limited to 5 connections to avoid impacting the production RDS
- Connection string stored in environment variable, never hardcoded

## Inter-Agent Communication

The Analytics agent does not have inter-agent tools. Communication flows through the Leader:

1. **Usage questions:** User asks Leader → Leader delegates to Analytics → Analytics returns data
2. **Profitability questions:** User asks Leader → Leader delegates to both Analytics (usage) and Finance (revenue) → Leader correlates and responds
3. **Direct queries:** User can also chat directly with Analytics agent for pure usage data

## Environment Variables

New env var added to `.env.example` and `config.ts`:

```
ZAP_GPT_DATABASE_URL=postgresql://readonly_user:password@ozaponline-db.c2zu4m4yoxb5.us-east-1.rds.amazonaws.com:5432/ozapgpt
```

## File Changes Summary

| File | Change |
|------|--------|
| `integrations/zapgpt-db.ts` | **New** — pg pool to zap-gpt-api RDS |
| `tools/analytics.ts` | **New** — 8 tool handlers |
| `config.ts` | Add `zapGptDatabaseUrl` |
| `runtime/tool-executor.ts` | Register analytics tools |
| `db/seed.ts` | Add Analytics agent with tools |
| `.env.example` | Add `ZAP_GPT_DATABASE_URL` |
