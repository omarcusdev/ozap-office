# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ozap Office is a virtual AI office — a pixelart-styled isometric office rendered on HTML Canvas where AI agents sit at desks, execute tasks, and collaborate. Each agent is backed by AWS Bedrock (Claude via Converse API) with its own system prompt, tools, and optional cron schedule.

## Monorepo Structure

pnpm workspace with three packages:

- **`apps/server`** — Fastify API + WebSocket server (TypeScript, ESM). Runs AI agents via Bedrock Converse API, cron scheduling, tool execution, meetings, and approvals.
- **`apps/web`** — Next.js 15 frontend (React 19, Tailwind v4). Renders the isometric office on a `<canvas>` element and streams agent activity via WebSocket.
- **`packages/shared`** — Shared types and constants consumed by both apps.

## Commands

```bash
pnpm dev:server          # tsx watch (port 3001)
pnpm dev:web             # next dev (port 3000)
pnpm build               # build all packages
pnpm db:generate         # drizzle-kit generate migrations
pnpm db:migrate          # drizzle-kit run migrations
pnpm db:seed             # seed agents (upserts by name)

# Per-package
pnpm -F @ozap-office/server typecheck
pnpm -F @ozap-office/web typecheck
```

## Database

PostgreSQL with Drizzle ORM. Schema in `apps/server/src/db/schema.ts`. Tables: `agents`, `task_runs`, `events`, `meetings`, `meeting_messages`, `approvals`, `conversation_sessions`, `conversation_messages`, `page_views`, `agent_memories`. Migrations live in `apps/server/drizzle/`.

## Architecture

### Agent Execution Pipeline

1. Trigger (cron / manual / meeting) → `executeAgent()` in `runtime/executor.ts`
2. Creates a `task_run` row, sets agent status to `working`
3. Enters `runAgenticLoop`: calls Bedrock Converse → processes tool calls → loops until `end_turn`
4. Each step emits events to DB and broadcasts via `eventBus` → WebSocket → frontend

### Tool System

Tools are defined per-agent as JSON schemas (stored in `agents.tools` JSONB column). `runtime/tool-executor.ts` routes tool names to handler modules:
- `tools/leader.ts` — askAgent, getAgentHistory, delegateTask (Leader can orchestrate other agents)
- `tools/finance.ts` — getOrders, getProducts, getRevenueSummary (queries Cakto payment API)
- `tools/memory.ts` — updateCoreMemory, deleteCoreMemory, saveToArchive, searchArchive (agent persistent memory)
- `tools/ads.ts` — Meta Ads campaign management (create, pause, activate, duplicate, compare, budget, targeting)
- `tools/analytics.ts` — ZapGPT usage analytics (usage summary, top users, daily trends, model breakdown)
- `tools/traffic.ts` — LP traffic analytics (summary, by source, daily, UTM breakdown, page breakdown)
- `tools/promo.ts` — getActivePromo, updatePromoConfig (GitHub-backed promo configuration)

Supporting integrations in `integrations/`:
- `cakto-client.ts` — Cakto payment gateway API client
- `meta-ads-mcp-client.ts` — Meta Ads API client
- `zapgpt-db.ts` — Read-only connection to ZapGPT database for analytics

To add a new tool domain: create `tools/<domain>.ts` with `execute<Domain>Tool()`, register tool names in `tool-executor.ts`.

### Real-time Communication

`events/event-bus.ts` wraps Node EventEmitter with typed events (agentEvent, agentStatus, meetingMessage). `events/websocket.ts` bridges the event bus to WebSocket clients with per-agent subscription filtering.

### Frontend Structure

The web app uses Next.js 15 App Router. Files live under `apps/web/app/` (routes) and `apps/web/lib/` (library code). No `src/` directory. UI components use shadcn/ui (`lib/components/ui/`).

### Frontend Canvas Rendering

Isometric office rendered on HTML Canvas with sprite-based drawing. The rendering pipeline:
- `lib/canvas/tile-map.ts` — defines the office grid layout (rooms, furniture, walls)
- `lib/canvas/sprite-manager.ts` — draws tiles, agents, and UI elements
- `lib/canvas/coordinates.ts` — grid-to-screen isometric coordinate conversion
- `lib/canvas/office-renderer.ts` — orchestrates rendering loop + click hit-testing
- `lib/canvas/sprite-loader.ts` + `sprite-cache.ts` — sprite asset loading and caching
- `lib/canvas/effects.ts` + `colorize.ts` — visual effects and color utilities
- `lib/components/office-canvas.tsx` — React wrapper with animation loop and interaction handling

### State Management

Zustand stores (`lib/stores/`) + TanStack Query (`lib/queries/`), wired in `app/providers.tsx`:
- `stores/agent-store.ts` — agent list, status tracking, selection state
- `stores/ws-store.ts` — persistent WebSocket connection with reconnect
- `stores/event-store.ts` — per-agent event stream for current execution
- `stores/conversation-store.ts` — multi-turn conversation state per agent
- `stores/meeting-store.ts` — meeting state and messages
- `queries/agent-queries.ts`, `session-queries.ts`, `conversation-queries.ts`, `meeting-queries.ts` — TanStack Query hooks for data fetching
- `hooks/use-agents-animation.ts` — smooth agent position animation

## Environment Variables

See `.env.example`. Required: `DATABASE_URL`, `OZAP_OFFICE_API_KEY`. Optional: `AWS_REGION`, `PORT`, `CORS_ORIGIN`, `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `META_ADS_ACCESS_TOKEN`, `META_ADS_ACCOUNT_ID`, `META_ADS_APP_ID`, `META_ADS_APP_SECRET`, `ADS_DAILY_BUDGET_LIMIT`, `ZAP_GPT_DATABASE_URL`, `GITHUB_TOKEN`. Frontend uses `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_API_KEY`.

## Infrastructure & Deployment

**Production:** EC2 instance `i-025ac97362e218181` (IP: `13.219.31.27`), us-east-1
- PostgreSQL runs locally on the EC2 (not RDS)
- Nginx reverse proxy: port 80 → Next.js :3000 + API :3001 + WebSocket
- PM2 manages two processes: `ozap-office-server` (cwd: `/opt/ozap-office`) and `ozap-office-web` (cwd: `/opt/ozap-office/apps/web`)
- All commands run via AWS SSM (no SSH). Use `AWS_PROFILE=ozapgpt`
- `.env` file at `/opt/ozap-office/.env` (dotenv loaded by server entrypoint)

**Deploy (full rebuild):**
```bash
AWS_PROFILE=ozapgpt aws ssm send-command \
  --instance-ids i-025ac97362e218181 \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["export PATH=/root/.local/share/pnpm:/root/.local/share/pnpm/global/5/node_modules/.bin:/root/.local/share/pnpm/nodejs/20.20.1/bin:$PATH && export HOME=/root","cd /opt/ozap-office && git pull","cd /opt/ozap-office && pnpm install --frozen-lockfile","cd /opt/ozap-office && pnpm -F @ozap-office/shared build && pnpm -F @ozap-office/server build && NEXT_PUBLIC_API_URL= NEXT_PUBLIC_WS_URL= NEXT_PUBLIC_API_KEY=ozap-office-key-2026 pnpm -F @ozap-office/web build","cd /opt/ozap-office && export $(grep -v ^# .env | xargs) && pnpm -F @ozap-office/server db:migrate","cd /opt/ozap-office && export $(grep -v ^# .env | xargs) && pnpm -F @ozap-office/server db:seed","pm2 delete all","cd /opt/ozap-office && pm2 start apps/server/dist/index.js --name ozap-office-server","cd /opt/ozap-office/apps/web && pm2 start node_modules/next/dist/bin/next --name ozap-office-web -- start --port 3000","pm2 save"]}' \
  --timeout-seconds 300 \
  --query 'Command.CommandId' --output text --region us-east-1
```

**Check deploy result:**
```bash
AWS_PROFILE=ozapgpt aws ssm get-command-invocation \
  --command-id <COMMAND_ID> \
  --instance-id i-025ac97362e218181 \
  --query '[Status, StandardOutputContent, StandardErrorContent]' \
  --output json --region us-east-1
```

**View server logs:**
```bash
AWS_PROFILE=ozapgpt aws ssm send-command \
  --instance-ids i-025ac97362e218181 \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["export HOME=/root && cat /root/.pm2/logs/ozap-office-server-out.log | tail -50"]}' \
  --timeout-seconds 30 \
  --query 'Command.CommandId' --output text --region us-east-1
```

**PM2 important notes:**
- Server cwd must be `/opt/ozap-office` (not `apps/server`) so `dotenv/config` finds `.env`
- Web cwd must be `/opt/ozap-office/apps/web` so Next.js finds `.next/`
- After too many restarts, PM2 marks process as `errored` — use `pm2 delete all` then recreate
- Always `export HOME=/root` in SSM commands (SSM doesn't set HOME)
- For db:migrate and db:seed, source .env first: `export $(grep -v ^# .env | xargs)`

## Key Conventions

- No Vercel/Amplify — both frontend and backend run on the same EC2. Vercel was tried but abandoned due to mixed content (HTTPS Vercel → HTTP EC2 API blocked by browsers). Same-origin via Nginx avoids this.
- All API routes are prefixed with `/api/` and authenticated via `x-api-key` header
- WebSocket connects at `/ws?key=<api-key>`
- Agent status lifecycle: `idle` → `working`/`thinking` → `idle` (or `has_report` after cron, `error` on failure)
- The Finance agent has a Portuguese system prompt (the product targets Brazilian businesses)
- Seed script upserts agents by name — safe to re-run to update prompts/tools without losing agent IDs
