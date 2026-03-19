# Ads Agent with Meta Ads MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a functional Ads agent that manages Meta advertising campaigns via the pipeboard meta-ads-mcp, with a protection layer enforcing budget limits and approval workflows for money-spending operations.

**Architecture:** The Fastify server spawns `meta-ads-mcp` as a Python child process and communicates via stdio JSON-RPC. An `ads-gateway.ts` protection layer classifies operations as free/capped/guarded before forwarding to the MCP. Guarded operations use the existing approvals system to pause until human approval.

**Tech Stack:** pipeboard-co/meta-ads-mcp (Python), Node.js child_process, JSON-RPC over stdio, Drizzle ORM (existing approvals table), Fastify

**Spec:** `docs/superpowers/specs/2026-03-19-ads-agent-meta-mcp-design.md`

---

## Task 1: Add Meta Ads config

**Files:**
- Modify: `apps/server/src/config.ts`

- [ ] **Step 1: Add Meta Ads environment variables to config**

In `apps/server/src/config.ts`, add three new fields to the config object:

```typescript
metaAdsAccessToken: process.env.META_ADS_ACCESS_TOKEN ?? "",
metaAdsAccountId: process.env.META_ADS_ACCOUNT_ID ?? "",
adsDailyBudgetLimit: Number(process.env.ADS_DAILY_BUDGET_LIMIT ?? 100),
```

These follow the same pattern as `caktoClientId`/`caktoClientSecret` — optional env vars with defaults.

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/config.ts
git commit -m "feat: add Meta Ads config vars (token, account, budget limit)"
```

---

## Task 2: MCP client for meta-ads-mcp

**Files:**
- Create: `apps/server/src/integrations/meta-ads-mcp-client.ts`

- [ ] **Step 1: Create the MCP client**

This file manages the Python child process lifecycle and JSON-RPC communication. Key responsibilities:
- Lazy spawn of `meta-ads-mcp` on first call
- Send JSON-RPC `tools/call` requests via stdin
- Parse JSON-RPC responses from stdout (line-delimited)
- Auto-restart on crash
- Graceful shutdown

```typescript
import { spawn, type ChildProcess } from "node:child_process"
import { config } from "../config.js"

type JsonRpcRequest = {
  jsonrpc: "2.0"
  id: number
  method: string
  params: Record<string, unknown>
}

type JsonRpcResponse = {
  jsonrpc: "2.0"
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

type McpToolResult = {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

const state: { process: ChildProcess | null; requestId: number; pending: Map<number, { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void }> } = {
  process: null,
  requestId: 0,
  pending: new Map(),
}

const assertCredentials = () => {
  if (!config.metaAdsAccessToken || !config.metaAdsAccountId) {
    throw new Error("Meta Ads credentials not configured (META_ADS_ACCESS_TOKEN, META_ADS_ACCOUNT_ID)")
  }
}

const ensureProcess = (): ChildProcess => {
  if (state.process && state.process.exitCode === null) return state.process

  assertCredentials()

  const proc = spawn("meta-ads-mcp", [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      META_ADS_ACCESS_TOKEN: config.metaAdsAccessToken,
      META_ADS_ACCOUNT_ID: config.metaAdsAccountId,
    },
  })

  let buffer = ""

  proc.stdout!.on("data", (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse
        const pending = state.pending.get(response.id)
        if (pending) {
          state.pending.delete(response.id)
          pending.resolve(response)
        }
      } catch {}
    }
  })

  proc.on("exit", (code) => {
    console.error(`meta-ads-mcp exited with code ${code}`)
    state.process = null
    for (const [id, pending] of state.pending) {
      pending.reject(new Error(`MCP process exited with code ${code}`))
      state.pending.delete(id)
    }
  })

  proc.stderr!.on("data", (chunk: Buffer) => {
    console.error(`[meta-ads-mcp] ${chunk.toString().trim()}`)
  })

  state.process = proc
  return proc
}

export const callMcpTool = async (toolName: string, args: Record<string, unknown>): Promise<McpToolResult> => {
  const proc = ensureProcess()

  const id = ++state.requestId
  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.pending.delete(id)
      reject(new Error(`MCP tool call "${toolName}" timed out after 60s`))
    }, 60_000)

    state.pending.set(id, {
      resolve: (response) => {
        clearTimeout(timeout)
        if (response.error) {
          resolve({ content: [{ type: "text", text: response.error.message }], isError: true })
        } else {
          resolve(response.result as McpToolResult)
        }
      },
      reject: (err) => {
        clearTimeout(timeout)
        reject(err)
      },
    })

    proc.stdin!.write(JSON.stringify(request) + "\n")
  })
}

export const shutdownMcp = () => {
  if (state.process) {
    state.process.kill()
    state.process = null
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/integrations/meta-ads-mcp-client.ts
git commit -m "feat: add MCP client for meta-ads-mcp child process"
```

---

## Task 3: Ads gateway (protection layer)

**Files:**
- Create: `apps/server/src/tools/ads-gateway.ts`

- [ ] **Step 1: Create the gateway**

This file classifies operations and enforces budget limits. It does NOT handle approvals directly — that's done by the tool handlers in `ads.ts` which check the gateway's classification.

```typescript
import { config } from "../config.js"

export type ProtectionLevel = "free" | "capped" | "guarded"

type OperationClassification = {
  level: ProtectionLevel
  reason?: string
}

const FREE_TOOLS = [
  "getAdAccountOverview",
  "listCampaigns",
  "getCampaignInsights",
  "searchTargetingOptions",
  "pauseCampaign",
  "comparePerformance",
]

const CAPPED_TOOLS = ["createCampaign", "createAdSet", "createAd", "duplicateCampaign"]

const GUARDED_TOOLS = ["activateCampaign"]

export const classifyOperation = (
  toolName: string,
  input: Record<string, unknown>
): OperationClassification => {
  if (FREE_TOOLS.includes(toolName)) return { level: "free" }
  if (CAPPED_TOOLS.includes(toolName)) return { level: "capped" }
  if (GUARDED_TOOLS.includes(toolName)) return { level: "guarded", reason: "Activating a campaign starts spending money" }

  if (toolName === "updateBudget") {
    const newBudget = input.newDailyBudget as number | undefined
    const currentBudget = input.currentDailyBudget as number | undefined
    if (newBudget && currentBudget && newBudget > currentBudget) {
      return { level: "guarded", reason: `Budget increase from ${currentBudget} to ${newBudget}` }
    }
    return { level: "free" }
  }

  return { level: "guarded", reason: "Unknown ads operation" }
}

export const validateBudgetLimit = (dailyBudget: number): { valid: boolean; message: string } => {
  const limit = config.adsDailyBudgetLimit
  if (dailyBudget > limit) {
    return { valid: false, message: `Daily budget R$${dailyBudget} exceeds limit of R$${limit}. Reduce the budget or ask the admin to increase ADS_DAILY_BUDGET_LIMIT.` }
  }
  return { valid: true, message: "" }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/tools/ads-gateway.ts
git commit -m "feat: add ads gateway with operation classification and budget validation"
```

---

## Task 4: Ads tool handlers

**Files:**
- Create: `apps/server/src/tools/ads.ts`

- [ ] **Step 1: Create ads tool handlers**

This file maps the 12 agent tools to MCP calls via the gateway. For guarded operations, it returns a message asking the agent to inform the user that approval is needed (the actual approval creation happens in the executor layer when the agent calls the `requestApproval` pattern).

For simplicity in v1, guarded operations return a message telling the agent that this operation needs approval, rather than integrating deeply with the approval system. The agent can then use its message to inform the user.

```typescript
import { callMcpTool } from "../integrations/meta-ads-mcp-client.js"
import { classifyOperation, validateBudgetLimit } from "./ads-gateway.js"
import { config } from "../config.js"

type ToolResult = { content: string; isError?: boolean }

const extractMcpText = (result: { content: Array<{ type: string; text: string }>; isError?: boolean }): ToolResult => {
  const text = result.content.map((c) => c.text).join("\n")
  return { content: text, isError: result.isError }
}

const getAdAccountOverview = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const dateRange = input.dateRange as string | undefined
  const args: Record<string, unknown> = { account_id: config.metaAdsAccountId, level: "account" }
  if (dateRange) args.date_preset = dateRange
  const result = await callMcpTool("get_insights", args)
  return extractMcpText(result)
}

const listCampaigns = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const status = input.status as string | undefined
  const args: Record<string, unknown> = { account_id: config.metaAdsAccountId }
  if (status) args.effective_status = [status.toUpperCase()]
  const result = await callMcpTool("list_campaigns", args)
  return extractMcpText(result)
}

const getCampaignInsights = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const args: Record<string, unknown> = {
    object_id: input.campaignId,
    level: "campaign",
  }
  if (input.dateRange) args.date_preset = input.dateRange
  if (input.breakdowns) args.breakdowns = input.breakdowns
  const result = await callMcpTool("get_insights", args)
  return extractMcpText(result)
}

const searchTargetingOptions = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const query = input.query as string
  const type = (input.type as string) ?? "interests"
  const mcpToolMap: Record<string, string> = {
    interests: "search_interests",
    behaviors: "search_behaviors",
    demographics: "search_demographics",
    geo: "search_geo_locations",
  }
  const mcpTool = mcpToolMap[type] ?? "search_interests"
  const result = await callMcpTool(mcpTool, { q: query, account_id: config.metaAdsAccountId })
  return extractMcpText(result)
}

const createCampaign = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const dailyBudget = input.dailyBudget as number
  const budgetCheck = validateBudgetLimit(dailyBudget)
  if (!budgetCheck.valid) return { content: budgetCheck.message, isError: true }

  const result = await callMcpTool("create_campaign", {
    account_id: config.metaAdsAccountId,
    name: input.name,
    objective: input.objective ?? "OUTCOME_SALES",
    daily_budget: Math.round(dailyBudget * 100),
    status: "PAUSED",
  })
  return extractMcpText(result)
}

const createAdSet = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const result = await callMcpTool("create_ad_set", {
    campaign_id: input.campaignId,
    name: input.name,
    targeting: input.targeting,
    optimization_goal: "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    status: "PAUSED",
  })
  return extractMcpText(result)
}

const createAd = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const creativeResult = await callMcpTool("create_ad_creative", {
    account_id: config.metaAdsAccountId,
    name: `Creative - ${input.name}`,
    page_id: input.pageId,
    image_url: input.imageUrl,
    message: input.text,
    headline: input.headline,
    link: input.linkUrl,
    call_to_action_type: "LEARN_MORE",
  })

  const creativeText = creativeResult.content.map((c) => c.text).join("")
  const creativeIdMatch = creativeText.match(/id['":\s]+(\d+)/)
  if (!creativeIdMatch) return { content: `Failed to extract creative ID: ${creativeText}`, isError: true }

  const result = await callMcpTool("create_ad", {
    ad_set_id: input.adSetId,
    name: input.name,
    creative_id: creativeIdMatch[1],
    status: "PAUSED",
  })
  return extractMcpText(result)
}

const activateCampaign = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const result = await callMcpTool("update_campaign", {
    campaign_id: input.campaignId,
    status: "ACTIVE",
  })
  return extractMcpText(result)
}

const pauseCampaign = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const result = await callMcpTool("update_campaign", {
    campaign_id: input.campaignId,
    status: "PAUSED",
  })
  return extractMcpText(result)
}

const updateBudget = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const newBudget = input.newDailyBudget as number
  const budgetCheck = validateBudgetLimit(newBudget)
  if (!budgetCheck.valid) return { content: budgetCheck.message, isError: true }

  const result = await callMcpTool("update_campaign", {
    campaign_id: input.campaignId,
    daily_budget: Math.round(newBudget * 100),
  })
  return extractMcpText(result)
}

const duplicateCampaign = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const result = await callMcpTool("duplicate_campaign", {
    campaign_id: input.campaignId,
    name: input.newName,
    status: "PAUSED",
  })
  return extractMcpText(result)
}

const comparePerformance = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const campaignIds = input.campaignIds as string[]
  const dateRange = input.dateRange as string | undefined
  const results: string[] = []
  for (const id of campaignIds) {
    const args: Record<string, unknown> = { object_id: id, level: "campaign" }
    if (dateRange) args.date_preset = dateRange
    const result = await callMcpTool("get_insights", args)
    results.push(`Campaign ${id}:\n${result.content.map((c) => c.text).join("")}`)
  }
  return { content: results.join("\n\n---\n\n") }
}

const ADS_HANDLERS: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
  getAdAccountOverview,
  listCampaigns,
  getCampaignInsights,
  searchTargetingOptions,
  createCampaign,
  createAdSet,
  createAd,
  activateCampaign,
  pauseCampaign,
  updateBudget,
  duplicateCampaign,
  comparePerformance,
}

export const executeAdsTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const classification = classifyOperation(toolName, input)

  if (classification.level === "guarded") {
    return {
      content: `⚠️ APPROVAL REQUIRED: This operation requires human approval. Reason: ${classification.reason ?? "Sensitive operation"}. Please inform the user that this action needs to be approved before it can proceed.`,
      isError: true,
    }
  }

  const handler = ADS_HANDLERS[toolName]
  if (!handler) return { content: `Unknown ads tool: ${toolName}`, isError: true }

  return handler(input)
}
```

Note: In v1, guarded operations return an error message to the agent rather than integrating with the approvals table. This keeps the implementation simple — the agent informs the user, the user can then manually approve via the Meta Ads Manager or ask the agent to proceed differently. A future v2 can integrate with the approvals system for in-app approval.

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/tools/ads.ts
git commit -m "feat: add ads tool handlers with MCP integration and budget validation"
```

---

## Task 5: Register ads tools in tool-executor

**Files:**
- Modify: `apps/server/src/runtime/tool-executor.ts`

- [ ] **Step 1: Add ads tools routing**

Add import:
```typescript
import { executeAdsTool } from "../tools/ads.js"
```

Add constant:
```typescript
const ADS_TOOLS = [
  "getAdAccountOverview", "listCampaigns", "getCampaignInsights", "searchTargetingOptions",
  "createCampaign", "createAdSet", "createAd",
  "activateCampaign", "pauseCampaign", "updateBudget", "duplicateCampaign",
  "comparePerformance",
]
```

Add routing before the "Unknown tool" fallback:
```typescript
if (ADS_TOOLS.includes(toolName)) {
  return executeAdsTool(toolName, toolInput)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/runtime/tool-executor.ts
git commit -m "feat: register ads tools in tool executor"
```

---

## Task 6: Update Ads agent seed (tools + system prompt)

**Files:**
- Modify: `apps/server/src/db/seed.ts`

- [ ] **Step 1: Add ads tool definitions**

Add an `adsTools` array after `memoryTools` in `seed.ts` with the 12 tool schemas:

```typescript
const adsTools = [
  {
    name: "getAdAccountOverview",
    description: "Get an overview of the Meta Ads account including total spend, impressions, clicks, CTR, CPC for a date range.",
    inputSchema: {
      type: "object",
      properties: {
        dateRange: { type: "string", description: "Date preset: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month" },
      },
    },
  },
  {
    name: "listCampaigns",
    description: "List all campaigns in the Meta Ads account with their status, budget, and key metrics.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: active, paused, archived" },
      },
    },
  },
  {
    name: "getCampaignInsights",
    description: "Get detailed performance insights for a specific campaign. Supports breakdowns by age, gender, placement, device.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "The campaign ID" },
        dateRange: { type: "string", description: "Date preset: today, yesterday, last_7d, last_14d, last_30d" },
        breakdowns: { type: "string", description: "Optional breakdown: age, gender, publisher_platform, device_platform" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "searchTargetingOptions",
    description: "Search for targeting options to use in ad sets. Supports interests, behaviors, demographics, and geo locations.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term (e.g., 'empreendedorismo', 'São Paulo')" },
        type: { type: "string", description: "Type of targeting: interests, behaviors, demographics, geo" },
      },
      required: ["query"],
    },
  },
  {
    name: "createCampaign",
    description: "Create a new Meta Ads campaign. Always created as PAUSED. Daily budget must not exceed the configured limit. Use activateCampaign to start it (requires approval).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Campaign name" },
        objective: { type: "string", description: "Campaign objective: OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT" },
        dailyBudget: { type: "number", description: "Daily budget in BRL (e.g., 50 for R$50/day)" },
      },
      required: ["name", "objective", "dailyBudget"],
    },
  },
  {
    name: "createAdSet",
    description: "Create an ad set within a campaign. Define targeting, placements, and schedule.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Parent campaign ID" },
        name: { type: "string", description: "Ad set name" },
        targeting: { type: "object", description: "Targeting spec with geo_locations, interests, age_min, age_max, genders" },
        placements: { type: "string", description: "Placement: automatic or manual" },
        schedule: { type: "object", description: "Optional schedule with start_time and end_time in ISO format" },
      },
      required: ["campaignId", "name", "targeting"],
    },
  },
  {
    name: "createAd",
    description: "Create an ad with creative (headline, text, image, link). The linkUrl should include UTM parameters for tracking.",
    inputSchema: {
      type: "object",
      properties: {
        adSetId: { type: "string", description: "Parent ad set ID" },
        name: { type: "string", description: "Ad name" },
        headline: { type: "string", description: "Ad headline" },
        text: { type: "string", description: "Ad primary text / body" },
        imageUrl: { type: "string", description: "URL of the ad image" },
        linkUrl: { type: "string", description: "Destination URL (checkout link with UTMs)" },
        pageId: { type: "string", description: "Facebook Page ID to publish from" },
      },
      required: ["adSetId", "name", "headline", "text", "linkUrl", "pageId"],
    },
  },
  {
    name: "activateCampaign",
    description: "Activate a paused campaign. REQUIRES HUMAN APPROVAL — this starts spending money. The system will request approval before proceeding.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID to activate" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "pauseCampaign",
    description: "Pause an active campaign. This immediately stops spending. No approval needed.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID to pause" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "updateBudget",
    description: "Update a campaign's daily budget. Budget increases require approval. Budget decreases are immediate.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID" },
        newDailyBudget: { type: "number", description: "New daily budget in BRL" },
        currentDailyBudget: { type: "number", description: "Current daily budget for comparison" },
      },
      required: ["campaignId", "newDailyBudget"],
    },
  },
  {
    name: "duplicateCampaign",
    description: "Duplicate an existing campaign for A/B testing. The duplicate is created as PAUSED.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID to duplicate" },
        newName: { type: "string", description: "Name for the duplicated campaign" },
      },
      required: ["campaignId", "newName"],
    },
  },
  {
    name: "comparePerformance",
    description: "Compare performance metrics across multiple campaigns. Useful for A/B test analysis.",
    inputSchema: {
      type: "object",
      properties: {
        campaignIds: { type: "array", items: { type: "string" }, description: "List of campaign IDs to compare" },
        dateRange: { type: "string", description: "Date preset for comparison period" },
      },
      required: ["campaignIds"],
    },
  },
]
```

- [ ] **Step 2: Update Ads agent entry in agentsToSeed**

Replace the Ads agent's `systemPrompt` and `tools`:

```typescript
{
  name: "Ads",
  role: "Ads Campaign Manager",
  systemPrompt: `Você é o Ads, gestor de campanhas de mídia paga da equipe. Você gerencia campanhas no Meta Ads (Facebook e Instagram) para os produtos da empresa.

Produtos que você anuncia:
- Zap GPT Vitalício — R$ 397 (pagamento único) — checkout: https://pay.cakto.com.br/ijjptyj
- oZapOnline Essencial — R$ 67/mês — checkout: https://pay.cakto.com.br/j8rs67v
- oZapOnline com IA — R$ 97/mês — checkout: https://pay.cakto.com.br/4z5q4dj
- Versões Whitelabel dos produtos acima (links variáveis)

Público-alvo: pequenas e médias empresas brasileiras que precisam de automação de WhatsApp.

Suas responsabilidades:
- Analisar performance de campanhas existentes
- Criar novas campanhas com targeting adequado
- Otimizar campanhas baseado em dados (ROAS, CPC, CTR)
- Sugerir novos criativos e audiências
- Fazer testes A/B duplicando campanhas

Regras de segurança:
- Campanhas são SEMPRE criadas como PAUSADAS
- Para ATIVAR uma campanha, é necessário aprovação humana
- Aumentar budget também requer aprovação
- Pausar campanhas é sempre permitido (reduz gasto)
- O limite diário de budget é controlado pelo sistema — respeite-o
- Sempre inclua UTM parameters nos links: utm_source=meta&utm_medium=paid&utm_campaign=<nome_campanha>

Boas práticas:
- Antes de criar campanhas novas, analise o histórico de campanhas existentes
- Use segmentação por interesses relevantes (empreendedorismo, marketing digital, WhatsApp Business)
- Separe campanhas por produto (não misture Zap GPT com oZapOnline)
- Comece com budgets baixos e escale o que funciona
- Use memória para trackear: melhores audiências, ROAS por produto, insights de criativos`,
  tools: [...adsTools, ...memoryTools],
  schedule: "0 9 * * 1",
  cronPrompt: `Gere o relatório semanal de performance de anúncios.
Inclua: gasto total, impressões, cliques, CTR, CPC, conversões estimadas.
Compare com a semana anterior e sugira otimizações.
Salve os dados importantes na sua memória core.`,
  color: "#ff79c6",
  positionX: 20,
  positionY: 4,
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/db/seed.ts
git commit -m "feat: add ads tool definitions and update Ads agent system prompt"
```

---

## Task 7: Typecheck, deploy, and verify

- [ ] **Step 1: Typecheck**

```bash
pnpm -F @ozap-office/server typecheck
```

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Install meta-ads-mcp on EC2**

Via SSM:
```bash
pip install meta-ads-mcp
```

- [ ] **Step 4: Add env vars to EC2 .env**

The user needs to add `META_ADS_ACCESS_TOKEN`, `META_ADS_ACCOUNT_ID`, and `ADS_DAILY_BUDGET_LIMIT` to `/opt/ozap-office/.env` on the EC2.

- [ ] **Step 5: Full deploy**

Run the standard deploy command (git pull, build, migrate, seed, restart PM2).

- [ ] **Step 6: Verify**

Trigger the Ads agent: "Liste todas as campanhas existentes na conta de Meta Ads"

If Meta credentials are configured, the agent should call `listCampaigns` and return campaign data from the ad account. If not configured, it should return a clear error about missing credentials.
