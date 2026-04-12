# Architecture

**Analysis Date:** 2026-04-12

## Pattern Overview

**Overall:** Event-driven multi-agent runtime with real-time push to a canvas frontend

**Key Characteristics:**
- Agents are database rows with stored system prompts, tool schemas (JSONB), and cron schedules
- Every execution runs through a single recursive agentic loop that calls Bedrock and handles tool use
- All internal state changes are persisted to PostgreSQL and immediately broadcast over WebSocket
- Frontend is a read-only observer — it renders what the server pushes, never polls for agent state

## Layers

**API + WebSocket Layer:**
- Purpose: HTTP routes and WebSocket endpoint, authentication, request routing
- Location: `apps/server/src/routes/`, `apps/server/src/events/websocket.ts`
- Contains: Fastify route handlers, WebSocket client registry, per-agent subscription filter
- Depends on: Runtime layer, DB client, event bus
- Used by: Frontend (`apps/web/lib/api-client.ts`, `apps/web/lib/ws-client.ts`)

**Runtime Layer:**
- Purpose: Agent execution, Bedrock conversation management, meeting orchestration
- Location: `apps/server/src/runtime/`
- Contains: `executor.ts` (main loop), `bedrock.ts` (AWS Bedrock client), `tool-executor.ts` (router), `meeting-engine.ts`
- Depends on: Tool layer, DB layer, event bus, integrations
- Used by: Routes, scheduler, x-trigger

**Tool Layer:**
- Purpose: Domain-specific action implementations called from the agentic loop
- Location: `apps/server/src/tools/`
- Contains: `leader.ts`, `finance.ts`, `memory.ts`, `ads.ts`, `analytics.ts`, `traffic.ts`, `promo.ts`, `twitter.ts`
- Depends on: Integration layer, DB client
- Used by: `runtime/tool-executor.ts` only

**Integration Layer:**
- Purpose: External API clients (payment, ads, analytics, social)
- Location: `apps/server/src/integrations/`
- Contains: `cakto-client.ts`, `meta-ads-mcp-client.ts`, `zapgpt-db.ts`, `twitter-client.ts`, `abacatepay-client.ts`
- Depends on: Environment variables only
- Used by: Tool layer

**Data Layer:**
- Purpose: PostgreSQL schema definitions and database client
- Location: `apps/server/src/db/`
- Contains: `schema.ts`, `client.ts`, `seed.ts`
- Depends on: `DATABASE_URL` env var, Drizzle ORM
- Used by: All server layers

**Event Bus:**
- Purpose: In-process typed event emitter decoupling runtime from WebSocket transport
- Location: `apps/server/src/events/event-bus.ts`
- Contains: Three event types: `agentEvent`, `agentStatus`, `meetingMessage`
- Depends on: Node `EventEmitter`
- Used by: Runtime (emits), WebSocket handler (subscribes), x-trigger (subscribes)

**Frontend:**
- Purpose: Canvas-based isometric office visualization and agent interaction UI
- Location: `apps/web/`
- Contains: Canvas rendering pipeline, Zustand stores, TanStack Query hooks, WebSocket client
- Depends on: Server API and WebSocket endpoint

## Data Flow

**Cron-Triggered Agent Execution:**

1. `startScheduler()` in `apps/server/src/scheduler/index.ts` reads `agents` rows where `schedule IS NOT NULL`
2. `node-cron` fires at the configured cron expression; calls `executeAgent(agentId, "cron", cronPrompt)`
3. `executeAgent` in `apps/server/src/runtime/executor.ts` inserts a `task_runs` row, sets agent status to `working`
4. Builds system prompt: `buildDateContext()` + `agent.systemPrompt` + core memory block + team roster (if needed)
5. Enters `runAgenticLoop`: calls `converse()` in `apps/server/src/runtime/bedrock.ts` via AWS Bedrock Converse API
6. Each Bedrock response is inspected: text content → emitted as `message` event; tool use blocks → routed through `executeTool()`
7. `executeTool` in `apps/server/src/runtime/tool-executor.ts` dispatches to the matching `execute*Tool()` function by tool name
8. Tool result appended to messages as a `user` role turn; loop recurses until `stopReason === "end_turn"`
9. `task_runs` row updated to `completed`; agent status set to `has_report`
10. Every `emitEvent()` call persists to `events` table and calls `eventBus.emit("agentEvent", ...)`
11. WebSocket handler broadcasts to subscribed clients as `{ type: "agent_event", payload: event }`

**Manual Agent Trigger (user message):**

1. Frontend calls `POST /api/agents/:id/run` with `{ message }` body via `apps/web/lib/api-client.ts`
2. Route handler in `apps/server/src/routes/agents.ts` calls `executeAgent(id, "manual", message)`
3. Executor loads conversation history from `conversation_messages` (last 20, latest session)
4. Prepends history to messages array before first Bedrock call
5. After loop completes, saves user+assistant turn to `conversation_messages` and updates session title
6. Agent status set to `idle` (not `has_report` for manual triggers)

**WebSocket Real-Time Push:**

1. Frontend connects to `GET /ws?key=<api-key>` on server startup
2. Client can send `{ type: "subscribe", payload: { agentId } }` to filter events
3. Server broadcasts typed messages: `agent_event`, `agent_status`, `meeting_message`
4. `apps/web/app/providers.tsx` `WebSocketProvider` handles messages and writes to Zustand stores

**Event-Driven X Agent Trigger:**

1. `registerXTrigger()` in `apps/server/src/events/x-trigger.ts` subscribes to `eventBus` on server start
2. Notable events (type `completed` or tool_result with specific tool names) trigger the X agent
3. 1-hour cooldown and idle-check prevent spam; calls `executeAgent(xAgentId, "event", prompt)`

**Meeting Flow:**

1. Frontend calls `POST /api/meetings` → creates `meetings` row
2. `callMeeting()` animates all agents to meeting room (waypoint-based movement in `use-agents-animation.ts`)
3. User sends message via `POST /api/meetings/:id/messages`
4. `processMeetingMessage()` in `apps/server/src/runtime/meeting-engine.ts` calls `executeAgentForMeeting()` for all agents in parallel (round 1)
5. Agents responding with `"PASS"` are excluded; remaining trigger up to 2 reaction rounds
6. Each message is broadcast via `eventBus.emit("meetingMessage", ...)` → WebSocket → `meeting-store`

**State Management:**

- `useAgentStore` — agent list and status; seeded by TanStack Query, updated live by WebSocket `agent_status` messages
- `useEventStore` — per-agent event stream for active task run; updated by WebSocket `agent_event` messages (only for selected agent)
- `useConversationStore` — conversation sessions and messages; loaded via TanStack Query on agent selection
- `useMeetingStore` — meeting lifecycle, messages, agent typing state
- `useWsStore` — WebSocket connection status

## Key Abstractions

**Agent:**
- Purpose: Autonomous actor with a system prompt, tool definitions (JSONB), canvas position, and cron schedule
- Schema: `apps/server/src/db/schema.ts` `agents` table
- Type: `packages/shared/src/types.ts` `AgentConfig`
- Status lifecycle: `idle → working → thinking → idle | has_report | error`

**TaskRun:**
- Purpose: Single execution record tying a trigger to inputs, outputs, and event stream
- Schema: `apps/server/src/db/schema.ts` `taskRuns` table
- Triggers: `"cron" | "event" | "meeting" | "manual"`
- Statuses: `"running" | "completed" | "failed" | "waiting_approval"`

**AgentEvent:**
- Purpose: Granular execution step written to DB and pushed to frontend in real time
- Schema: `apps/server/src/db/schema.ts` `events` table
- Types: `"user_message" | "thinking" | "tool_call" | "tool_result" | "message" | "approval_needed" | "completed" | "error" | "delegation_start" | "delegation_response"`

**ToolDefinition:**
- Purpose: JSON schema stored on agent row; controls what Bedrock is told the agent can do
- Type: `packages/shared/src/types.ts` `ToolDefinition`
- Fields: `name`, `description`, `inputSchema`
- Routing: `apps/server/src/runtime/tool-executor.ts` maps tool names to handler modules

**AgentMemory:**
- Purpose: Persistent key-value memory injected into system prompt each run
- Types: `"core"` (injected into every prompt) and `"archival"` (searchable but not auto-injected)
- Schema: `apps/server/src/db/schema.ts` `agentMemories` table
- Built by: `buildCoreMemoryBlock()` in `apps/server/src/runtime/executor.ts`

## Entry Points

**Server:**
- Location: `apps/server/src/index.ts`
- Starts: Fastify server, registers routes, WebSocket, starts scheduler, registers X trigger, recovers orphaned runs
- Port: 3001 (configurable via `PORT` env var)

**Web:**
- Location: `apps/web/app/page.tsx` (single-page app — only one route)
- Layout: `apps/web/app/layout.tsx`
- Bootstraps: `OfficeProvider` → `QueryClientProvider` + `WebSocketProvider`

**Scheduler:**
- Location: `apps/server/src/scheduler/index.ts`
- Called once at startup; registers `node-cron` jobs for all agents with non-null `schedule` column

**Startup Recovery:**
- Location: `apps/server/src/startup.ts`
- Marks any `running` task runs as `failed` and resets agent statuses after crash/restart

## Error Handling

**Strategy:** Errors are caught at the agentic loop boundary, written to DB as `error` events, and the task run is marked `failed`. Agent status is set to `"error"`.

**Patterns:**
- `runAgenticLoop` is wrapped in `.catch()` inside `executeAgent`; error message stored in `task_runs.output`
- `executeTool` wraps all tool handlers in try/catch; returns `{ content, isError: true }` on failure
- WebSocket parse errors are silently swallowed (empty catch block in `websocket.ts`)
- Cron execution errors are logged to console but do not crash the scheduler

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` directly; Fastify's built-in logger for HTTP requests

**Validation:** No runtime schema validation on API inputs (raw type casts). Tool inputs are typed via generics.

**Authentication:**
- All API routes (except `/api/track` and `/ws`) require `x-api-key` header via `apps/server/src/middleware/api-key.ts`
- WebSocket authenticates via `?key=` query param at connection time

**Date/Timezone:**
- All agent prompts prepend current date in São Paulo timezone via `buildDateContext()` in `apps/server/src/runtime/executor.ts`
- All DB timestamps stored with timezone

---

*Architecture analysis: 2026-04-12*
