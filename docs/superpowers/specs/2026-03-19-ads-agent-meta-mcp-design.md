# Ads Agent with Meta Ads MCP — Design Spec

## Overview

Functional Ads agent that manages Meta (Facebook/Instagram) advertising campaigns via the `pipeboard-co/meta-ads-mcp` Python MCP server. The agent operates with full autonomy (create, activate, pause, optimize campaigns) but with a protection layer that enforces budget limits and requires human approval for money-spending operations.

## Products the Agent Manages

| Product | Model | Price | Checkout URL |
|---------|-------|-------|-------------|
| Zap GPT Vitalício | One-time (desktop) | R$ 397 | pay.cakto.com.br/ijjptyj |
| oZapOnline Essencial | Monthly SaaS | R$ 67/mo | pay.cakto.com.br/j8rs67v |
| oZapOnline com IA | Monthly SaaS | R$ 97/mo | pay.cakto.com.br/4z5q4dj |
| Whitelabel variants | Various | Various | Various |

Target audience: Brazilian small/medium businesses needing WhatsApp automation.

---

## Architecture

```
Ads Agent → tool call → tool-executor.ts → ads-gateway.ts (protection layer)
  → MCP client (stdio) → meta-ads-mcp (Python process) → Meta Marketing API
```

The `pipeboard-co/meta-ads-mcp` runs as a child process on EC2, spawned by the Fastify server. Communication via stdio JSON-RPC (standard MCP transport). The protection layer (`ads-gateway.ts`) sits between the agent's tool calls and the MCP client.

### MCP Client (`integrations/meta-ads-mcp-client.ts`)

Manages the MCP child process lifecycle:
- Spawns `meta-ads-mcp` with `--token` and `--account-id` args on first use (lazy init)
- Sends JSON-RPC `tools/call` requests via stdin, reads responses from stdout
- Handles process crashes with automatic restart
- Graceful shutdown on server exit

### Protection Layer (`tools/ads-gateway.ts`)

Classifies every MCP tool call into three categories:

**Free (no approval needed):**
All read operations — listing campaigns, getting insights, searching targeting options, pausing campaigns, reducing budgets.

**Capped (budget validation):**
`createCampaign`, `createAdSet` — validates that `daily_budget` does not exceed `ADS_DAILY_BUDGET_LIMIT` env var. Always forces status to PAUSED regardless of what the agent requests.

**Guarded (approval required):**
Operations that spend money — activating campaigns (`updateCampaign` with status ACTIVE), increasing budgets (`updateAdSet` with higher budget), deleting ad sets or ads.

When a guarded operation is triggered:
1. Create an approval row in the `approvals` table with the operation payload
2. Emit `approval_needed` event via eventBus
3. Task run status changes to `waiting_approval`
4. Agent execution pauses until user approves/rejects via the existing approval system
5. On approval, `resumeAfterApproval` in executor.ts continues the agent loop

---

## Tools Exposed to the Ads Agent (12 tools)

### Read Operations (free)

**getAdAccountOverview(dateRange?)** — Account-level summary: total spend, impressions, clicks, CTR, CPC, conversions. Calls MCP `get_insights` at account level.

**listCampaigns(status?)** — List all campaigns with name, status, daily_budget, lifetime metrics. Calls MCP `list_campaigns`.

**getCampaignInsights(campaignId, dateRange, breakdowns?)** — Detailed performance for a specific campaign. Supports breakdowns by age, gender, placement, device. Calls MCP `get_insights`.

**searchTargetingOptions(query, type)** — Search for interests, behaviors, demographics, or geo locations for audience targeting. Calls MCP `search_interests`, `search_behaviors`, `search_demographics`, `search_geo_locations` based on type.

### Creation Operations (capped — budget validated, created PAUSED)

**createCampaign(name, objective, dailyBudget)** — Create a new campaign. Validates dailyBudget against ADS_DAILY_BUDGET_LIMIT. Forces PAUSED status. Calls MCP `create_campaign`.

**createAdSet(campaignId, name, targeting, placements, schedule)** — Create an ad set within a campaign. Inherits campaign budget. Calls MCP `create_ad_set`.

**createAd(adSetId, name, headline, text, imageUrl, linkUrl)** — Create an ad with creative. The linkUrl should be a product checkout URL with UTMs. Calls MCP `create_ad` + `create_ad_creative`.

### Management Operations (mixed)

**activateCampaign(campaignId)** — Activate a paused campaign. **GUARDED** — requires approval. Calls MCP `update_campaign` with status ACTIVE.

**pauseCampaign(campaignId)** — Pause an active campaign. **FREE** — no approval needed (reducing spend is always safe). Calls MCP `update_campaign` with status PAUSED.

**updateBudget(campaignId, newDailyBudget)** — Change campaign daily budget. **GUARDED if increasing**, free if decreasing. Validates against ADS_DAILY_BUDGET_LIMIT. Calls MCP `update_campaign`.

**duplicateCampaign(campaignId, newName)** — Duplicate an existing campaign for A/B testing. Created as PAUSED. **CAPPED**. Calls MCP `create_campaign` + copies ad sets/ads.

### Analysis Operations (free)

**comparePerformance(campaignIds, dateRange)** — Compare metrics across multiple campaigns or time periods. Calls MCP `get_insights` for each and formats comparison.

---

## System Prompt

The Ads agent gets a Portuguese system prompt that includes:
- Product catalog with prices and checkout URLs
- Guidelines for Meta Ads best practices (audience sizing, creative testing, budget allocation)
- Instruction to always analyze historical data before creating new campaigns
- Instruction to always create campaigns as PAUSED and request activation
- Instruction to use core memory for tracking: best-performing audiences, creative insights, ROAS by product
- Instruction to use archival memory for weekly performance reports

Cron schedule: `0 9 * * 1` (Mondays 9am) — weekly performance report with optimization suggestions.

---

## Environment Variables

```
META_ADS_ACCESS_TOKEN=<long-lived token with ads_management + ads_read permissions>
META_ADS_ACCOUNT_ID=act_<account_id>
ADS_DAILY_BUDGET_LIMIT=100
```

The access token needs these Meta permissions: `ads_management`, `ads_read`, `pages_read_engagement`, `business_management`.

---

## Installation on EC2

```bash
pip install meta-ads-mcp
```

The MCP binary (`meta-ads-mcp`) must be in PATH. The server spawns it as a child process.

---

## Implementation Scope

### Files to create
- `apps/server/src/integrations/meta-ads-mcp-client.ts` — MCP client that manages the Python child process, sends JSON-RPC requests, handles responses
- `apps/server/src/tools/ads-gateway.ts` — Protection layer: classifies operations, enforces budget limits, triggers approvals for guarded ops
- `apps/server/src/tools/ads.ts` — Tool handlers that map agent tool calls to MCP operations via the gateway

### Files to modify
- `apps/server/src/runtime/tool-executor.ts` — Register ads tools
- `apps/server/src/db/seed.ts` — Add ads tool definitions + update Ads agent system prompt
- `apps/server/src/config.ts` — Add META_ADS_ACCESS_TOKEN, META_ADS_ACCOUNT_ID, ADS_DAILY_BUDGET_LIMIT

### Files NOT modified
- Frontend — existing approval UI handles the approval flow
- Database schema — existing approvals table is sufficient
- Executor — existing resumeAfterApproval handles the resume flow
- Memory system — already available to all agents
