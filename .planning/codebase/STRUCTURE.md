# Codebase Structure

**Analysis Date:** 2026-04-12

## Directory Layout

```
ozap-office/                      # pnpm workspace root
├── apps/
│   ├── server/                   # Fastify API + WebSocket server
│   │   ├── src/
│   │   │   ├── index.ts          # Server entry point
│   │   │   ├── config.ts         # Env-based config object
│   │   │   ├── startup.ts        # Orphaned task run recovery
│   │   │   ├── db/
│   │   │   │   ├── schema.ts     # Drizzle table definitions (source of truth)
│   │   │   │   ├── client.ts     # Drizzle db instance
│   │   │   │   └── seed.ts       # Agent upsert seed (run with db:seed)
│   │   │   ├── events/
│   │   │   │   ├── event-bus.ts  # Typed Node EventEmitter wrapper
│   │   │   │   ├── websocket.ts  # Fastify WebSocket handler + broadcaster
│   │   │   │   └── x-trigger.ts  # Event-driven X agent trigger
│   │   │   ├── middleware/
│   │   │   │   └── api-key.ts    # x-api-key header validation hook
│   │   │   ├── routes/
│   │   │   │   ├── agents.ts     # /api/agents/* endpoints
│   │   │   │   ├── task-runs.ts  # /api/task-runs/* endpoints
│   │   │   │   ├── approvals.ts  # /api/approvals/* endpoints
│   │   │   │   ├── meetings.ts   # /api/meetings/* endpoints
│   │   │   │   └── tracking.ts   # /api/track (no auth, LP pixel)
│   │   │   ├── runtime/
│   │   │   │   ├── executor.ts   # executeAgent(), runAgenticLoop(), meeting variants
│   │   │   │   ├── bedrock.ts    # converse() — AWS Bedrock Converse API client
│   │   │   │   ├── tool-executor.ts  # executeTool() — routes tool names to handlers
│   │   │   │   └── meeting-engine.ts # processMeetingMessage(), completeMeeting()
│   │   │   ├── scheduler/
│   │   │   │   └── index.ts      # startScheduler() — node-cron job registration
│   │   │   ├── tools/
│   │   │   │   ├── leader.ts     # askAgent, getAgentHistory, delegateTask
│   │   │   │   ├── finance.ts    # getOrders, getProducts, getRevenueSummary
│   │   │   │   ├── memory.ts     # updateCoreMemory, deleteCoreMemory, saveToArchive, searchArchive
│   │   │   │   ├── ads.ts        # Meta Ads campaign tools (12 tools)
│   │   │   │   ├── ads-gateway.ts # Ads tool dispatch helper
│   │   │   │   ├── analytics.ts  # ZapGPT usage analytics tools (8 tools)
│   │   │   │   ├── traffic.ts    # LP traffic analytics tools (5 tools)
│   │   │   │   ├── promo.ts      # getActivePromo, updatePromoConfig, price A/B testing (5 tools)
│   │   │   │   └── twitter.ts    # postTweet, getRecentTweets, getMentions
│   │   │   └── integrations/
│   │   │       ├── cakto-client.ts        # Cakto payment gateway API client
│   │   │       ├── abacatepay-client.ts   # AbacatePay Pix API client
│   │   │       ├── meta-ads-mcp-client.ts # Meta Ads API client
│   │   │       ├── zapgpt-db.ts           # Read-only ZapGPT Postgres connection
│   │   │       └── twitter-client.ts      # Twitter/X API client
│   │   ├── drizzle/              # Generated SQL migrations (committed)
│   │   ├── dist/                 # Compiled JS output (gitignored)
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── web/                      # Next.js 15 frontend
│       ├── app/
│       │   ├── layout.tsx        # Root HTML layout, font loading
│       │   ├── page.tsx          # Single page — entire UI lives here
│       │   ├── providers.tsx     # QueryClient + WebSocket provider tree
│       │   └── globals.css       # Tailwind base + custom CSS variables
│       ├── lib/
│       │   ├── api-client.ts     # Typed fetch wrapper for all API endpoints
│       │   ├── ws-client.ts      # WebSocket client factory with auto-reconnect
│       │   ├── utils.ts          # cn() utility (clsx + tailwind-merge)
│       │   ├── canvas/
│       │   │   ├── office-renderer.ts  # renderOffice(), hitTest() — top-level render orchestrator
│       │   │   ├── sprite-manager.ts   # draw* functions for each tile/character/UI type
│       │   │   ├── tile-map.ts         # OFFICE_MAP grid, FURNITURE_PLACEMENTS, room types
│       │   │   ├── coordinates.ts      # gridToScreen(), screenToGrid(), CANVAS_CONFIG
│       │   │   ├── sprite-loader.ts    # loadAllAssets() — fetches and parses sprite PNGs into pixel arrays
│       │   │   ├── sprite-cache.ts     # getCachedSprite() — OffscreenCanvas cache for scaled sprites
│       │   │   ├── effects.ts          # Visual effect helpers
│       │   │   └── colorize.ts         # colorizeSprite() — pixel-level palette replacement
│       │   ├── components/
│       │   │   ├── office-canvas.tsx   # React canvas wrapper with rAF loop and click handler
│       │   │   ├── thought-panel.tsx   # Right-side panel: event stream, conversation, sessions
│       │   │   ├── meeting-panel.tsx   # Right-side panel during meetings
│       │   │   ├── status-bar.tsx      # Bottom status bar (WS indicator, agent statuses)
│       │   │   ├── markdown-renderer.tsx  # Renders agent markdown responses
│       │   │   ├── delegation-thread.tsx  # Visualizes Leader delegation chains
│       │   │   ├── session-tab-bar.tsx    # Conversation session tabs
│       │   │   └── ui/                    # shadcn/ui primitives
│       │   ├── hooks/
│       │   │   └── use-agents-animation.ts  # Animation state machine + waypoint movement
│       │   ├── queries/
│       │   │   ├── agent-queries.ts         # useAgentsQuery, useLatestRunQuery, useTaskRunEventsQuery
│       │   │   ├── conversation-queries.ts  # useConversationQuery, useSendMessageMutation
│       │   │   ├── session-queries.ts       # useSessionsQuery, session mutations
│       │   │   └── meeting-queries.ts       # useMeetingMessagesQuery
│       │   └── stores/
│       │       ├── agent-store.ts        # useAgentStore — agent list, selection, status
│       │       ├── event-store.ts        # useEventStore — active task run event stream
│       │       ├── conversation-store.ts # useConversationStore — sessions and messages
│       │       ├── meeting-store.ts      # useMeetingStore — meeting lifecycle and chat
│       │       └── ws-store.ts           # useWsStore — WebSocket connection status
│       ├── public/assets/          # Sprite assets (PNG spritesheets)
│       │   ├── characters/         # Character walk/type/read sheets (6 palettes × 4 directions)
│       │   ├── floors/             # Floor tile variants
│       │   ├── furniture/          # Per-furniture-type directories with orientation/state PNGs
│       │   ├── walls/              # Wall tileset
│       │   └── bubbles/            # Status bubble sprites (working, done, waiting, error)
│       ├── next.config.ts
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts      # All shared TypeScript types (AgentConfig, AgentEvent, WsServerMessage, etc.)
│           ├── constants.ts  # Shared constants
│           └── index.ts      # Re-exports everything
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
└── .env.example
```

## Key File Locations

**Entry Points:**
- `apps/server/src/index.ts` — Server bootstrap; registers all routes, WS, scheduler, startup recovery
- `apps/web/app/page.tsx` — Single-page frontend root
- `apps/web/app/providers.tsx` — Provider tree (QueryClient, WebSocket bootstrap)

**Schema and Types:**
- `apps/server/src/db/schema.ts` — Drizzle table definitions (canonical DB schema)
- `packages/shared/src/types.ts` — All shared TypeScript types used by both apps
- `apps/server/drizzle/` — Generated migration SQL files

**Agent Runtime:**
- `apps/server/src/runtime/executor.ts` — `executeAgent()` and `runAgenticLoop()` — the core execution engine
- `apps/server/src/runtime/bedrock.ts` — `converse()` — single function wrapping Bedrock Converse API
- `apps/server/src/runtime/tool-executor.ts` — `executeTool()` — dispatches tool names to handler modules
- `apps/server/src/runtime/meeting-engine.ts` — `processMeetingMessage()` — multi-agent meeting coordination

**Scheduling:**
- `apps/server/src/scheduler/index.ts` — `startScheduler()` — reads DB and registers cron jobs at startup

**Event System:**
- `apps/server/src/events/event-bus.ts` — Typed event bus (agentEvent, agentStatus, meetingMessage)
- `apps/server/src/events/websocket.ts` — WebSocket handler wired to event bus
- `apps/server/src/events/x-trigger.ts` — Event-driven X agent activation

**Canvas Rendering:**
- `apps/web/lib/canvas/office-renderer.ts` — Top-level `renderOffice()` function called each animation frame
- `apps/web/lib/canvas/tile-map.ts` — `OFFICE_MAP` grid (30×20), `FURNITURE_PLACEMENTS`, `MEETING_ROUTES`
- `apps/web/lib/canvas/sprite-manager.ts` — All `draw*` functions
- `apps/web/lib/canvas/coordinates.ts` — `CANVAS_CONFIG`, `gridToScreen()`, `screenToGrid()`

**State:**
- `apps/web/lib/stores/` — All five Zustand stores
- `apps/web/lib/queries/` — All TanStack Query hooks

**Tools (one file per domain):**
- `apps/server/src/tools/leader.ts` — Inter-agent coordination
- `apps/server/src/tools/finance.ts` — Cakto/AbacatePay revenue queries
- `apps/server/src/tools/memory.ts` — Persistent agent memory
- `apps/server/src/tools/ads.ts` — Meta Ads campaign management
- `apps/server/src/tools/analytics.ts` — ZapGPT usage analytics
- `apps/server/src/tools/traffic.ts` — Landing page traffic analytics
- `apps/server/src/tools/promo.ts` — GitHub-backed promo config + price A/B testing
- `apps/server/src/tools/twitter.ts` — X/Twitter posting and reading

**Seed Data:**
- `apps/server/src/db/seed.ts` — Agent definitions (system prompts, tools, schedules, canvas positions); upserts by name

## Naming Conventions

**Files:**
- Server source files: `kebab-case.ts` (e.g., `tool-executor.ts`, `event-bus.ts`)
- React components: `kebab-case.tsx` (e.g., `office-canvas.tsx`, `thought-panel.tsx`)
- Stores: `<domain>-store.ts`
- Queries: `<domain>-queries.ts`
- Canvas modules: `<noun>.ts` (e.g., `coordinates.ts`, `colorize.ts`)

**Exported Functions:**
- Route registration: `register<Domain>Routes(server)` — e.g., `registerAgentRoutes`
- Tool handlers: `execute<Domain>Tool(toolName, input)` — e.g., `executeFinanceTool`
- React hooks: `use<Name>` in camelCase — e.g., `useAgentsAnimation`, `useAgentStore`
- Zustand stores: `use<Domain>Store` — e.g., `useAgentStore`
- Canvas draw functions: `draw<Target>` — e.g., `drawFloorTile`, `drawCharacter`

**Types:**
- Shared types: PascalCase in `packages/shared/src/types.ts`
- Local types: inline `type` declarations at top of file
- Zod/validation: not used — raw TypeScript types only

**DB Tables:**
- Snake_case in Postgres (e.g., `task_runs`, `agent_memories`)
- camelCase in Drizzle TypeScript (e.g., `taskRuns`, `agentMemories`)

## Import Conventions

**ESM with `.js` extensions (server):**
All server imports use explicit `.js` extensions even for TypeScript source files:
```typescript
import { executeAgent } from "./runtime/executor.js"
import { db } from "../db/client.js"
```

**Path aliases (web):**
The web app uses `@/` aliased to the `apps/web` root (configured in `tsconfig.json`):
```typescript
import { useAgentStore } from "@/lib/stores/agent-store"
import { api } from "@/lib/api-client"
```

**Shared package:**
Both apps import from `@ozap-office/shared`:
```typescript
import type { AgentConfig, AgentEvent } from "@ozap-office/shared"
```

**Import grouping order:**
1. Node built-ins (`node:events`, `node:path`)
2. Third-party packages
3. Internal packages (`@ozap-office/shared`)
4. Relative imports (deepest-to-shallowest)

## Where to Add New Code

**New tool domain:**
1. Create `apps/server/src/tools/<domain>.ts` with `execute<Domain>Tool(toolName, input)` function
2. Register tool name constants and dispatch call in `apps/server/src/runtime/tool-executor.ts`
3. Create `apps/server/src/integrations/<service>-client.ts` if a new external API is needed
4. Add tool definitions to the relevant agent(s) in `apps/server/src/db/seed.ts`

**New API route group:**
1. Create `apps/server/src/routes/<domain>.ts` exporting `register<Domain>Routes(server)`
2. Import and call in `apps/server/src/index.ts` after the `preHandler` auth hook (if auth required) or before it (if public like tracking)

**New Zustand store:**
- Add `apps/web/lib/stores/<domain>-store.ts` following the `create<Store>` + named export pattern

**New TanStack Query hook:**
- Add to `apps/web/lib/queries/<domain>-queries.ts`; use `api.*` from `apps/web/lib/api-client.ts`

**New canvas element:**
- Add draw function to `apps/web/lib/canvas/sprite-manager.ts`
- Add grid data to `apps/web/lib/canvas/tile-map.ts`
- Call from `apps/web/lib/canvas/office-renderer.ts` in the appropriate layer (floor, z-sorted, or overlay)

**New DB table:**
1. Add to `apps/server/src/db/schema.ts`
2. Run `pnpm db:generate` then `pnpm db:migrate`

## Special Directories

**`apps/server/drizzle/`:**
- Purpose: Auto-generated SQL migration files
- Generated: Yes (`pnpm db:generate`)
- Committed: Yes

**`apps/server/dist/`:**
- Purpose: Compiled TypeScript output (used by PM2 in production)
- Generated: Yes (`pnpm build`)
- Committed: No

**`apps/web/.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No

**`apps/web/public/assets/`:**
- Purpose: Pixel art sprite sheets loaded at runtime by `sprite-loader.ts`
- Generated: No (hand-crafted assets)
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: GSD codebase mapping documents for use by planning/execution agents
- Generated: By `/gsd:map-codebase` command
- Committed: Yes

---

*Structure analysis: 2026-04-12*
