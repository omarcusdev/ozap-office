# Codebase Concerns

**Analysis Date:** 2026-04-12

## Security Considerations

**API Key Exposed in Frontend Bundle:**
- Risk: `NEXT_PUBLIC_API_KEY` is a build-time env var baked into the browser bundle. Anyone can extract it from the JS and call any agent-run or meeting API.
- Files: `apps/web/lib/api-client.ts` (line 12), `apps/web/lib/ws-client.ts` (line 6)
- Current mitigation: The API key guards destructive server endpoints, but with it client-visible, the boundary is cosmetic.
- Recommendation: Move sensitive write operations (trigger agent, approve, send meeting message) behind server-side Next.js route handlers that hold the key server-side. Public read-only reads are fine NEXT_PUBLIC.

**WebSocket Auth via Query String:**
- Risk: API key appears in plaintext in the WebSocket URL (`/ws?key=<api-key>`), which lands in server access logs, browser history, and proxy logs.
- Files: `apps/server/src/events/websocket.ts` (line 39), `apps/web/lib/ws-client.ts` (line 9)
- Current mitigation: WSS in production encrypts traffic, but the key is still logged.
- Recommendation: Move key to an initial auth message over the socket (`{ type: "auth", key }`) rather than query string.

**Tracking Endpoint Has No Auth:**
- Risk: `/api/track` is deliberately unauthenticated (`middleware/api-key.ts` line 5 whitelists it). It accepts arbitrary `site` and `path` values, allowing anyone to pollute the `page_views` table with fake traffic data that AI agents use to make decisions.
- Files: `apps/server/src/middleware/api-key.ts`, `apps/server/src/routes/tracking.ts`
- Current mitigation: None — intentional design choice.
- Recommendation: Add `site` allowlist validation or a lightweight HMAC token in the tracking request.

**No Input Validation on Tool Parameters:**
- Risk: All 99+ tool input reads use `input.X as string | undefined` TypeScript casts with no runtime validation. A malformed Bedrock response or a hallucinating agent can pass unexpected types silently.
- Files: All files in `apps/server/src/tools/` — representative examples: `tools/twitter.ts` (line 13), `tools/promo.ts` (line 101), `tools/ads.ts` (line 116)
- Current mitigation: Individual required-field checks for a few fields.
- Recommendation: Add zod or `@sinclair/typebox` validation at the `executeTool` boundary before dispatching to handlers.

**CORS Defaults to localhost:3000:**
- Risk: `CORS_ORIGIN` env var defaults to `http://localhost:3000`. If this env var is missing in production, CORS blocks the frontend or defaults to an overly permissive setting depending on Fastify behavior.
- Files: `apps/server/src/config.ts` (line 12)
- Current mitigation: Production sets `CORS_ORIGIN` in `.env`.
- Recommendation: Treat `CORS_ORIGIN` as a required env var like `DATABASE_URL`, or document the risk clearly.

---

## Agent Autonomy Risks

**Unbounded Recursive Agentic Loop:**
- Risk: `runAgenticLoop` in `apps/server/src/runtime/executor.ts` (line 306) is tail-recursive with no iteration cap. A model stuck in a tool-use loop (e.g., calling `getOrders` then deciding to call it again) will recurse until Bedrock returns an error or the process runs out of memory/stack.
- Files: `apps/server/src/runtime/executor.ts` (lines 245-315)
- Impact: Can crash the server process or run up large Bedrock token costs.
- Fix approach: Add an `iteration` counter parameter; throw after a configured max (e.g., 20 iterations).

**Twitter Agent Posts Without Human Review:**
- Risk: The X-trigger (`apps/server/src/events/x-trigger.ts`) fires the X agent on any "notable" agent completion event. The agent can call `postTweet` without any approval gate, posting publicly to the company X account.
- Files: `apps/server/src/events/x-trigger.ts`, `apps/server/src/tools/twitter.ts`
- Current mitigation: 1-hour cooldown (`COOLDOWN_MS`), agent decides based on content.
- Recommendation: Add `postTweet` to the approval gate similar to `activateCampaign`, or at minimum add a dry-run/staging mode.

**Promo Agent Can Change Live Product Pricing:**
- Risk: `updatePromoConfig` pushes a JSON commit directly to the GitHub repo (`omarcusdev/zap-landing`) which the landing page reads. The agent can change the price shown to all users from R$197 to R$397 with no human in the loop.
- Files: `apps/server/src/tools/promo.ts` (line 99-165)
- Hardcoded values: GitHub API URL is hardcoded at line 10: `"https://api.github.com/repos/omarcusdev/zap-landing/contents/src/config/promo-config.json"`
- Current mitigation: The three allowed price tiers are hardcoded in `PRICE_TIERS` (lines 21-46), limiting range.
- Recommendation: Require approval for any `updatePromoConfig` call that changes the `tier` field.

**Ads Agent Can Create and Pause Campaigns Autonomously:**
- Risk: `createCampaign`, `createAdSet`, `createAd`, and `pauseCampaign` execute immediately with no approval. An agent can create paused ad structures silently, accumulating clutter in the Meta Ads account.
- Files: `apps/server/src/tools/ads.ts`, `apps/server/src/tools/ads-gateway.ts`
- Current mitigation: `activateCampaign` and budget increases require approval. New campaigns are created in `PAUSED` status.
- Recommendation: Require approval for `createCampaign` as well, since creation itself bills setup fees and counts toward account limits.

**Leader Agent Can Trigger Any Other Agent:**
- Risk: `delegateTask` in `apps/server/src/tools/leader.ts` calls `executeAgent` directly for any agent ID from the DB, bypassing cron schedule and any manual trigger safeguards.
- Files: `apps/server/src/tools/leader.ts` (lines 100-133)
- Impact: Leader hallucinating an agent ID or task description could cause cascading autonomous actions across multiple agents simultaneously.
- Current mitigation: None beyond Bedrock returning a valid UUID.

**Meeting Engine Fires All Agents Concurrently:**
- Risk: `processMeetingMessage` in `apps/server/src/runtime/meeting-engine.ts` calls `Promise.all` on all non-error agents simultaneously (lines 86-97, 104-121). With 5 agents, this launches up to 5 concurrent Bedrock calls per meeting round, plus up to 3 reaction rounds — potentially 15+ simultaneous Bedrock API calls.
- Files: `apps/server/src/runtime/meeting-engine.ts`
- Impact: Bedrock throttling, and all agents appear as `thinking` simultaneously which is visually misleading.
- Fix approach: Serialize or concurrency-limit meeting responses (p-limit or sequential).

---

## AI Hallucination Risks

**Date Context Is Best-Effort:**
- Risk: `buildDateContext()` in `executor.ts` (line 52-68) injects the current date in the system prompt. However, all agents share a flat string. If an agent's reasoning spans multiple Bedrock turns (tool loops), it may re-use cached context from the first call and reason about a stale date within a long run.
- Files: `apps/server/src/runtime/executor.ts` (lines 52-68)
- Impact: Finance or Promo agents may compute "days remaining" or "this month's revenue" against a slightly wrong timestamp.
- Fix approach: Acceptable as-is for most use cases; document the known limitation.

**Price Test Revenue Attribution Is Approximate:**
- Risk: `collectAndAdvancePriceTest` calculates Cakto card revenue by filtering all paid orders where `amount === tierAmountCentavos`. If multiple products share the same price as the tier under test, those sales are incorrectly attributed to the test variant.
- Files: `apps/server/src/tools/promo.ts` (lines 353-369)
- Impact: Wrong winner determination in A/B price tests.
- Fix approach: Filter by specific product ID instead of just amount.

**AbacatePay Billing Revenue Fetches ALL Bills:**
- Risk: `fetchBillingPaidAmount` in `apps/server/src/integrations/abacatepay-client.ts` calls `GET /v1/billing/list` (fetches all billings) then finds the target by ID client-side (line 39). If the billing list grows large, this is both slow and may return paginated results that omit the target billing.
- Files: `apps/server/src/integrations/abacatepay-client.ts` (lines 29-45)
- Impact: Incorrect Pix revenue snapshots → wrong price test conclusions.
- Fix approach: Use a direct `GET /v1/billing/:id` endpoint if available; add pagination handling otherwise.

---

## Infrastructure & Deployment

**Single EC2 with No Redundancy:**
- Risk: Both Next.js web and Fastify API run on a single EC2 instance (`i-025ac97362e218181`). Any hardware failure, crash, or OOM kill takes down the entire system.
- Current mitigation: PM2 restarts crashed processes.
- Impact: Complete downtime — no agents, no frontend, no tracking.
- Scaling path: Extract to separate instances or use an ECS/Fargate setup with multiple tasks.

**PostgreSQL on Same EC2 as Application:**
- Risk: Database and application share one machine. A disk-full event or OS crash corrupts or loses all data.
- Current mitigation: None identified — no backup configuration exists in the codebase.
- Impact: Permanent loss of all agent memory, task history, conversation history, and price test data.
- Fix approach: Automated daily `pg_dump` to S3 at minimum; consider migrating to RDS with automated backups.

**No Database Backup Strategy:**
- Risk: No backup scripts, cron jobs, or infrastructure-as-code referencing `pg_dump` or snapshot policies exist anywhere in the repository.
- Files: Entire codebase — absence of `/scripts/backup*`, no backup-related cron in `scheduler/index.ts`
- Impact: Total data loss on machine failure.
- Priority: High.

**Manual Deploy via AWS SSM:**
- Risk: Deploys require manually running a multi-step SSM command. A partially failed deploy (e.g., build succeeds but migration fails) leaves the system in an inconsistent state with no automated rollback.
- Files: `CLAUDE.md` deploy command documentation
- Impact: Human error during deploy causes downtime.
- Fix approach: Wrap in a deploy script with explicit error checking and rollback steps; consider GitHub Actions for CI/CD.

**Scheduler Loads Agent Crons Once at Startup:**
- Risk: `startScheduler()` in `apps/server/src/scheduler/index.ts` reads agent schedules from DB at startup and registers cron jobs. If an agent's schedule is updated in the DB (e.g., via seed re-run), the change only takes effect after a server restart.
- Files: `apps/server/src/scheduler/index.ts`
- Impact: Misleading state — admin believes schedule was updated but cron still fires at old time.
- Fix approach: Re-register cron jobs after seed or add a `/api/agents/:id/schedule` PATCH endpoint that updates the in-memory scheduler.

---

## Tech Debt

**`as any` Suppression of TypeScript Errors:**
- Issue: Multiple `as any` casts silence type errors in the event bus, Bedrock tool config, and route body parsing.
- Files:
  - `apps/server/src/runtime/executor.ts` (lines 13, 27, 38)
  - `apps/server/src/tools/leader.ts` (line 34)
  - `apps/server/src/routes/tracking.ts` (line 41)
  - `apps/server/src/routes/agents.ts` (line 54)
  - `apps/web/lib/queries/agent-queries.ts` (lines 22-23)
  - `apps/web/lib/components/delegation-thread.tsx` (lines 25, 28)
- Impact: Type errors can silently pass at runtime.
- Fix approach: Type the `eventBus.emit` signatures properly; add Fastify schema validation for route bodies.

**Tool Input Parameters Are Unvalidated Runtime Casts:**
- Issue: 99+ instances of `input.X as string | undefined` across all tool files. No runtime schema validation at the tool dispatch boundary.
- Files: All files under `apps/server/src/tools/`
- Impact: Unexpected agent input (hallucinated types) silently passes type checks and causes runtime errors inside tool handlers.
- Fix approach: Add a thin zod validation wrapper in `apps/server/src/runtime/tool-executor.ts` before dispatching.

**Conversation History Sanitization Is Fragile:**
- Issue: `loadConversationHistory` in `executor.ts` (lines 131-144) manually removes duplicate consecutive roles and drops a leading assistant message. This is necessary because Bedrock requires alternating user/assistant roles, but the implementation doesn't handle all edge cases (e.g., multiple missing messages at start).
- Files: `apps/server/src/runtime/executor.ts` (lines 131-144)
- Impact: Bedrock may reject messages with validation errors during conversation resumption.
- Fix approach: Store and replay messages in validated format; enforce role alternation at insertion time.

**`duplicateCampaign` Is a Stub:**
- Issue: `duplicateCampaign` in `apps/server/src/tools/ads.ts` (line 261-263) returns a hard error immediately. The tool is still registered in `tool-executor.ts` and in the Ads agent's tool schema, so the agent may call it and receive an error.
- Files: `apps/server/src/tools/ads.ts` (lines 261-263)
- Impact: Confuses the agent when it attempts a reasonable operation.
- Fix approach: Remove the tool from the agent's tool schema in the seed, or implement it.

**Empty `catch {}` Blocks:**
- Issue: Silent error swallowing in multiple locations.
- Files:
  - `apps/server/src/integrations/meta-ads-mcp-client.ts` (line 55) — JSON parse errors from MCP stdout silently ignored
  - `apps/server/src/events/websocket.ts` (line 64) — malformed WS client messages silently dropped
  - `apps/server/src/tools/ads.ts` (line 195) — creative ID parse failure silently ignored
  - `apps/web/lib/ws-client.ts` (line 34) — JSON parse errors from server silently ignored
- Impact: Failures in these paths are invisible in logs and cannot be debugged.

**Logging Uses `console.*` Only:**
- Issue: The server uses raw `console.log` / `console.error` throughout (23 occurrences). Fastify's built-in `pino` logger is available via `server.log` but not used in business logic.
- Files: `apps/server/src/scheduler/index.ts`, `apps/server/src/startup.ts`, `apps/server/src/events/x-trigger.ts`, `apps/server/src/integrations/meta-ads-mcp-client.ts`
- Impact: Log output lacks structured fields (request ID, agent ID, timestamps), making production debugging harder.

---

## Performance Concerns

**Canvas Renders on Every Animation Frame with Full Z-Sort:**
- Issue: `renderOffice` in `apps/web/lib/canvas/office-renderer.ts` runs on every `requestAnimationFrame` (~60fps). It calls `collectZDrawables` which sorts all drawables on every frame, even when nothing has changed.
- Files: `apps/web/lib/canvas/office-renderer.ts`, `apps/web/lib/components/office-canvas.tsx` (lines 69-89)
- Impact: Unnecessary CPU usage on idle state. On older devices or high-DPI displays, this can cause jank.
- Fix approach: Cache the sorted drawables list and only re-sort when agent positions change.

**Two Separate `requestAnimationFrame` Loops:**
- Issue: `office-canvas.tsx` runs one `requestAnimationFrame` loop for canvas rendering, and `hooks/use-agents-animation.ts` runs a second independent loop for position interpolation. These loops are not synchronized.
- Files: `apps/web/lib/components/office-canvas.tsx`, `apps/web/lib/hooks/use-agents-animation.ts`
- Impact: Potential visual stuttering when the two loops are out of phase.
- Fix approach: Drive both from a single shared animation loop.

**`fetchAllOrders` Fetches Up to 500 Orders Recursively:**
- Issue: `fetchAllOrders` in `apps/server/src/integrations/cakto-client.ts` (line 203) paginates up to 500 orders recursively. For the `getRevenueSummary` and `collectAndAdvancePriceTest` tools, this is called on every agent run.
- Files: `apps/server/src/integrations/cakto-client.ts` (lines 181-204)
- Impact: Slow tool execution (multiple HTTP requests to Cakto API), and the 500-order cap silently truncates results for high-volume periods.
- Fix approach: Add explicit warning when truncation occurs; consider caching results in the DB for repeated queries of the same date range.

**WebSocket Server Uses In-Memory Client Set:**
- Issue: `clients` in `apps/server/src/events/websocket.ts` (line 13) is an in-memory `Set`. This works for a single-server deployment but cannot scale horizontally.
- Files: `apps/server/src/events/websocket.ts`
- Impact: Any future horizontal scaling attempt (multiple EC2 instances or containers) would not share WebSocket state.
- Current risk: Low (single EC2 deployment), but worth noting for future architecture decisions.

**MCP Process Is a Single Subprocess Bottleneck:**
- Issue: All Meta Ads operations share one `meta-ads-mcp` subprocess via stdio. Concurrent ad operations (e.g., from meeting engine running all agents simultaneously) are serialized through the single subprocess.
- Files: `apps/server/src/integrations/meta-ads-mcp-client.ts`
- Impact: MCP calls block each other; a slow or stuck MCP call blocks all subsequent ad operations for 60 seconds (timeout).

---

## Missing Tests

**Zero Test Coverage:**
- What's not tested: The entire codebase — no test files, no jest/vitest config, no testing framework listed in any `package.json`.
- Files: All `apps/server/src/` and `apps/web/lib/` — `find *.test.ts` returns empty.
- Risk: Agent execution pipeline, tool routing, revenue calculation, price test logic, and Canvas rendering are completely untested. Breaking changes go undetected until production.
- Priority: High for business-critical paths: `collectAndAdvancePriceTest`, `runAgenticLoop`, `tool-executor.ts` routing.

**No Test Infrastructure:**
- No test runner configuration exists in `apps/server/package.json`, `apps/web/package.json`, or root `package.json`.
- Adding tests requires first choosing and configuring a test runner (vitest recommended for ESM/TypeScript compatibility).

---

## Fragile Areas

**Agent Status Is Non-Atomic:**
- Files: `apps/server/src/runtime/executor.ts` (`updateAgentStatus`)
- Why fragile: Agent status is updated via two separate operations — a DB write and an in-memory `eventBus.emit`. If the process crashes between these two, the DB has the correct status but connected clients have stale UI state until reconnect.
- Safe modification: Always emit status after DB write; consider transactional outbox pattern for critical status changes.

**Approval Resume Loads Messages from `task_run.input`:**
- Files: `apps/server/src/runtime/executor.ts` (lines 346-370)
- Why fragile: `resumeAfterApproval` reads the Bedrock message array from `taskRuns.input` JSONB. If the serialized message array is too large for the JSONB column or gets corrupted, the approval flow silently does nothing (`if (!savedMessages) return`).
- Safe modification: Validate `savedMessages` shape before calling `runAgenticLoop`; log when returning early.

**Scheduler Cannot Update Running Crons:**
- Files: `apps/server/src/scheduler/index.ts`
- Why fragile: `node-cron` jobs are registered once at startup with no handle to cancel or replace them. Re-seeding agents does not update in-memory cron schedules.
- Safe modification: Always restart the server process after `db:seed` to ensure cron schedules match DB.

**Price Test Tier Expansion Requires Code Change:**
- Files: `apps/server/src/tools/promo.ts` (lines 21-46)
- Why fragile: `PRICE_TIERS` is a hardcoded object with Cakto/AbacatePay link URLs hardcoded per tier. Adding a new pricing tier (e.g., R$247) requires code change + deploy, not just DB configuration.
- Safe modification: Move price tier definitions to DB or a config table.

---

*Concerns audit: 2026-04-12*
