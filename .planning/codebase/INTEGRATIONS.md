# External Integrations

**Analysis Date:** 2026-04-12

## APIs & External Services

**AI / LLM:**
- AWS Bedrock (Claude Converse API) — Powers all AI agent execution. Each agent loop calls `ConverseCommand` via `BedrockRuntimeClient`.
  - SDK: `@aws-sdk/client-bedrock-runtime` 3.1009.0
  - Client: `apps/server/src/runtime/bedrock.ts`
  - Auth: `AWS_REGION` env var (default `us-east-1`). Credentials resolved via AWS SDK default credential chain (IAM role on EC2 or env vars).
  - Default model: `us.anthropic.claude-sonnet-4-6`

**Payment — Cards:**
- Cakto — Card payment gateway for ZapGPT product orders and revenue tracking.
  - Client: `apps/server/src/integrations/cakto-client.ts`
  - Auth: OAuth2 client credentials. `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET` env vars. Token cached in-memory with auto-refresh 5 minutes before expiry.
  - Base URL: `https://api.cakto.com.br`
  - Endpoints used: `/public_api/token/` (auth), `/public_api/orders/` (paginated order fetch), `/public_api/products/`
  - Used by: `apps/server/src/tools/finance.ts`, `apps/server/src/tools/promo.ts`

**Payment — Pix:**
- AbacatePay V1 — Pix link payment tracking for ZapGPT product sales.
  - Client: `apps/server/src/integrations/abacatepay-client.ts`
  - Auth: Bearer token. `ABACATEPAY_API_KEY` env var.
  - Base URL: `https://api.abacatepay.com/v1`
  - Endpoint used: `/billing/list` (reads paidAmount for a specific billing ID)
  - Used by: `apps/server/src/tools/promo.ts` (tracks Pix revenue in A/B price tests)

**Advertising:**
- Meta Ads — Facebook/Instagram campaign management.
  - Client: `apps/server/src/integrations/meta-ads-mcp-client.ts`
  - Protocol: MCP (Model Context Protocol) over stdio. Spawns `meta-ads-mcp` as a child process and communicates via JSON-RPC 2.0.
  - Auth: `META_ADS_ACCESS_TOKEN`, `META_ADS_APP_ID`, `META_ADS_APP_SECRET`, `META_ADS_ACCOUNT_ID` env vars.
  - Capabilities: create/pause/activate/duplicate campaigns, compare performance, adjust budgets, manage targeting.
  - Used by: `apps/server/src/tools/ads.ts`, `apps/server/src/tools/ads-gateway.ts`
  - Budget safety: `ADS_DAILY_BUDGET_LIMIT` env var caps daily spend.

**Social Media:**
- Twitter / X API — Used by the X agent to post tweets, fetch recent tweets, and read mentions.
  - Client: `apps/server/src/integrations/twitter-client.ts`
  - SDK: `twitter-api-v2` 1.29.0
  - Auth: OAuth 1.0a user context. `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET` env vars. Returns `null` client if any credential is missing (graceful degradation).
  - Used by: `apps/server/src/tools/twitter.ts`
  - Note: Free-tier API fallback logic exists in `apps/server/src/tools/twitter.ts`.

**Source Control / Config:**
- GitHub API — Promo agent reads and writes `promo-config.json` in the `zap-landing` repo to update active promotions.
  - Client: native `fetch` in `apps/server/src/tools/promo.ts`
  - Auth: Bearer token. `GITHUB_TOKEN` env var.
  - Target: `https://api.github.com/repos/omarcusdev/zap-landing/contents/src/config/promo-config.json`
  - API version header: `X-GitHub-Api-Version: 2022-11-28`

## Data Storage

**Primary Database:**
- PostgreSQL — Main application database. Runs locally on EC2 (not RDS).
  - Connection: `DATABASE_URL` env var (e.g. `postgresql://user:password@localhost:5432/ozap_office`)
  - Driver: `postgres` 3.4.8 with `ssl: "prefer"`
  - ORM: Drizzle ORM 0.36.4
  - Client: `apps/server/src/db/client.ts`
  - Schema: `apps/server/src/db/schema.ts`
  - Migrations: `apps/server/drizzle/` (managed by `drizzle-kit`)
  - Tables: `agents`, `task_runs`, `events`, `meetings`, `meeting_messages`, `approvals`, `conversation_sessions`, `conversation_messages`, `page_views`, `agent_memories`, `price_tests`, `price_test_variants`

**Analytics Database (read-only):**
- ZapGPT PostgreSQL — Separate read-only connection to the ZapGPT product database for usage analytics.
  - Connection: `ZAP_GPT_DATABASE_URL` env var
  - Driver: `postgres` 3.4.8 with `ssl: "require"`, max 5 connections, `idle_timeout: 30`
  - Client: `apps/server/src/integrations/zapgpt-db.ts`
  - Used by: `apps/server/src/tools/analytics.ts`

**File Storage:**
- Local filesystem only. No object storage (S3, GCS, etc.) detected.

**Caching:**
- In-memory token cache only (Cakto OAuth token in `apps/server/src/integrations/cakto-client.ts`). No Redis or external cache.

## Authentication & Identity

**API Auth:**
- Static API key via `x-api-key` header on all protected routes.
  - Key: `OZAP_OFFICE_API_KEY` env var.
  - Middleware: `apps/server/src/middleware/api-key.ts`
  - Exception: `/api/track` (LP tracking endpoint) is unauthenticated.

**WebSocket Auth:**
- API key passed as query param: `/ws?key=<api-key>`. Connection closed with code 4001 on mismatch.
  - Implementation: `apps/server/src/events/websocket.ts`

**No user authentication** — no user accounts, sessions, or identity providers.

## Real-time Communication

**WebSocket Server:**
- `@fastify/websocket` 11.2.0 wrapping `ws` library.
- Endpoint: `/ws?key=<api-key>`
- Server: `apps/server/src/events/websocket.ts`
- Event bus: `apps/server/src/events/event-bus.ts` (Node EventEmitter wrapper with typed events: `agentEvent`, `agentStatus`, `meetingMessage`)
- Broadcasts agent execution events, status changes, and meeting messages to subscribed clients.

**WebSocket Client:**
- Native browser `WebSocket` API.
- Client: `apps/web/lib/ws-client.ts`
- Auto-reconnects every 3 seconds on disconnect.
- URL resolves to same-origin (`wss://` or `ws://`) when `NEXT_PUBLIC_WS_URL` is not set.
- State stored in: `apps/web/lib/stores/ws-store.ts`

## Monitoring & Observability

**Error Tracking:**
- Not detected. No Sentry, Datadog, or similar.

**Logs:**
- Fastify built-in logger (`logger: true` in server init).
- PM2 captures stdout/stderr to `/root/.pm2/logs/` on EC2.
- Console statements for WebSocket and MCP process events.

## CI/CD & Deployment

**Hosting:**
- AWS EC2 `i-025ac97362e218181` (us-east-1, IP: `13.219.31.27`).

**Process Manager:**
- PM2 manages two processes: `ozap-office-server` and `ozap-office-web`.

**CI Pipeline:**
- Not detected. No GitHub Actions, CircleCI, or similar.

**Deploy:**
- Manual trigger via AWS SSM `AWS-RunShellScript` using `AWS_PROFILE=ozapgpt`.
- Steps: `git pull` → `pnpm install` → `pnpm build` → `db:migrate` → `db:seed` → PM2 recreate.

**Reverse Proxy:**
- Nginx on EC2 port 80. Routes to Next.js :3000 (frontend) and Fastify :3001 (API + WebSocket).

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` — Primary PostgreSQL connection string
- `OZAP_OFFICE_API_KEY` — Static API key for all protected endpoints

**Optional env vars:**
- `AWS_REGION` — AWS region for Bedrock (default: `us-east-1`)
- `PORT` — Server port (default: `3001`)
- `CORS_ORIGIN` — Allowed CORS origin (default: `http://localhost:3000`)
- `CAKTO_CLIENT_ID` / `CAKTO_CLIENT_SECRET` — Cakto OAuth credentials
- `META_ADS_ACCESS_TOKEN` / `META_ADS_ACCOUNT_ID` / `META_ADS_APP_ID` / `META_ADS_APP_SECRET` — Meta Ads
- `ADS_DAILY_BUDGET_LIMIT` — Meta Ads daily budget safety cap (default: `100`)
- `ZAP_GPT_DATABASE_URL` — Read-only ZapGPT analytics DB
- `GITHUB_TOKEN` — GitHub API token for promo config updates
- `TWITTER_API_KEY` / `TWITTER_API_SECRET` / `TWITTER_ACCESS_TOKEN` / `TWITTER_ACCESS_TOKEN_SECRET` — X/Twitter API
- `ABACATEPAY_API_KEY` — AbacatePay Pix billing API
- `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` / `NEXT_PUBLIC_API_KEY` — Frontend build-time vars

**Secrets location:**
- `.env` file at project root (`/opt/ozap-office/.env` on EC2). Loaded by `import "dotenv/config"` at `apps/server/src/index.ts` startup.

## Webhooks & Callbacks

**Incoming:**
- Not detected. No inbound webhooks from payment providers or third-party services.

**Outgoing:**
- GitHub API writes (Promo agent updates `promo-config.json` via PUT to GitHub Contents API).

---

*Integration audit: 2026-04-12*
