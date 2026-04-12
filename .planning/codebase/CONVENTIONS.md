# Coding Conventions

**Analysis Date:** 2026-04-12

## TypeScript Style

**Strict mode enabled** across all packages via `tsconfig.base.json`:
- `strict: true`, `isolatedModules: true`, `forceConsistentCasingInFileNames: true`
- Target: ES2022, module: ESNext, moduleResolution: bundler

**Immutability:**
- All variables declared with `const`. `let` and `var` do not appear anywhere in the codebase.
- Data transformations use `.map()`, `.filter()`, `.reduce()`, spread (`...`), and `Map` rather than mutation.

**No classes:**
- Zero class definitions in application code. Functionality is expressed through exported functions, closures, and plain objects.
- Event bus (`apps/server/src/events/event-bus.ts`) wraps `EventEmitter` inside a plain object rather than subclassing.

**Pure functions preferred:**
- Business logic (revenue calculation in `apps/server/src/tools/finance.ts`, coordinate math in `apps/web/lib/canvas/coordinates.ts`) is written as side-effect-free functions.
- Side effects (DB writes, event emissions) are isolated in dedicated functions like `updateAgentStatus` and `emitEvent` in `apps/server/src/runtime/executor.ts`.

## Naming Patterns

**Files:**
- kebab-case for all files: `event-bus.ts`, `tool-executor.ts`, `agent-store.ts`, `office-renderer.ts`
- React components: kebab-case files (`thought-panel.tsx`, `office-canvas.tsx`), PascalCase exports

**Functions:**
- camelCase for all functions: `executeAgent`, `buildCoreMemoryBlock`, `runAgenticLoop`, `loadConversationHistory`
- Boolean-returning helpers use verb prefixes: `isNearBottomRef`, `isProcessing`, `isMoving`
- Tool domain dispatcher functions follow pattern `execute<Domain>Tool`: `executeFinanceTool`, `executeAdsTool`, `executeMemoryTool`
- Route registration functions: `register<Domain>Routes`: `registerAgentRoutes`, `registerMeetingRoutes`

**Types:**
- PascalCase type aliases: `AgentStatus`, `ToolResult`, `WaypointState`, `AnimationType`
- Zustand store types suffixed with `Store`: `AgentStore`, `EventStore`, `WsStore`
- Shared types live in `packages/shared/src/types.ts` and are imported as `import type { ... } from "@ozap-office/shared"`

**Constants:**
- SCREAMING_SNAKE_CASE for module-level constants: `MOVE_SPEED`, `STAGGER_DELAY_MS`, `LEADER_TOOLS`, `STATUS_COLORS`

**Database columns:**
- Drizzle schema uses camelCase property names mapping to snake_case column names: `positionX` → `"position_x"`, `createdAt` → `"created_at"`

## Import Organization

**Server (ESM with explicit extensions):**
All relative imports in `apps/server/src/` must include `.js` extension (required for Node ESM):
```typescript
import { db } from "../db/client.js"
import { eventBus } from "../events/event-bus.js"
import { executeFinanceTool } from "../tools/finance.js"
```

**Web (Next.js bundler resolution):**
Relative imports use no extension. Path alias `@/*` maps to `apps/web/*`:
```typescript
import { useAgentStore } from "@/lib/stores/agent-store"
import { api } from "@/lib/api-client"
```

**Import order pattern (both apps):**
1. External packages (`import type { ... } from "@aws-sdk/client-bedrock-runtime"`)
2. Workspace packages (`import type { ... } from "@ozap-office/shared"`)
3. Internal relative imports (deepest to shallowest)

**`import type` usage:**
Used consistently for type-only imports: `import type { FastifyInstance } from "fastify"`, `import type { AgentStatus } from "@ozap-office/shared"`

## Error Handling

**Server tool handlers** (all files in `apps/server/src/tools/`):
- Every handler wraps logic in `try/catch` and returns `{ content: string; isError?: boolean }`
- Errors surface as `{ content: "...", isError: true }` rather than thrown exceptions
- Error message pattern: `error instanceof Error ? error.message : String(error)`

```typescript
} catch (error) {
  return {
    content: `Failed to fetch orders: ${error instanceof Error ? error.message : String(error)}`,
    isError: true,
  }
}
```

**Top-level executor** (`apps/server/src/runtime/executor.ts`):
- `runAgenticLoop` failures are caught by `.catch()` on the call site in `executeAgent`
- Failed runs update the `task_runs` row with `status: "failed"` and emit an `error` event

**Route handlers** (`apps/server/src/routes/*.ts`):
- Use early return with `reply.code(404).send({ error: "..." })` for not-found cases
- No global error middleware — Fastify's built-in error serialization handles uncaught throws

**Frontend API client** (`apps/web/lib/api-client.ts`):
- Central `request()` helper throws `new Error(...)` on non-OK HTTP responses
- Component-level catches use `.catch(console.error)` for non-critical failures (e.g., `markAgentRead`)
- TanStack Query mutations use `onSuccess`/`onError` callbacks rather than try/catch in components

**Config validation** (`apps/server/src/config.ts`):
- Required env vars validated at startup via `requireEnv(name)` which throws immediately on missing values

## State Management Patterns (Frontend)

**Zustand stores** (`apps/web/lib/stores/`):
- One store per domain: `agent-store.ts`, `event-store.ts`, `ws-store.ts`, `conversation-store.ts`, `meeting-store.ts`
- Created with `create<StoreType>((set, get) => ({...}))`. State shape and actions defined in a single type.
- Components subscribe with selector pattern: `useAgentStore((s) => s.selectedAgentId)` — never destructure the whole store
- Actions are methods on the store (not separate hooks): `setAgents`, `updateStatus`, `selectAgent`

**TanStack Query** (`apps/web/lib/queries/`):
- One file per domain: `agent-queries.ts`, `conversation-queries.ts`, `session-queries.ts`, `meeting-queries.ts`
- Query hooks use `staleTime` when appropriate (`staleTime: 30_000` for agents)
- Data from queries is piped into Zustand stores via `useEffect` (e.g., `useAgentsQuery` calls `setAgents`)
- Mutations invalidate related queries in `onSuccess` via `queryClient.invalidateQueries`

```typescript
export const useSendMessageMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, message }) => api.triggerAgent(agentId, message),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ["conversation", agentId] })
    },
  })
}
```

## Component Patterns (React)

**Structure:**
- All components are functional (arrow functions), exported as named constants
- Small presentational sub-components defined in the same file as their parent when tightly coupled (e.g., `UserBubble`, `AgentBubble`, `EventItem` in `apps/web/lib/components/thought-panel.tsx`)
- No default exports from component files

**"use client" directive:**
- Present at the top of all interactive components and hooks that use React state or browser APIs
- `apps/web/app/page.tsx` and server components omit it

**Prop types:**
- Inline type annotations on destructured props: `({ message }: { message: string })`
- For complex props, named types are declared above the component

**Refs:**
- `useRef` used extensively in `useAgentsAnimation` for mutable render state that must not trigger re-renders (positions, animation states, waypoints)
- `useCallback` used for event handlers and functions passed as props

## Database Query Patterns (Drizzle ORM)

**Client setup** (`apps/server/src/db/client.ts`):
```typescript
const connection = postgres(config.databaseUrl, { ssl: "prefer" })
export const db = drizzle(connection, { schema })
```

**Select pattern:**
```typescript
const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
```
Array destructuring for single-row queries — check for `undefined` before use.

**Insert with returning:**
```typescript
const [taskRun] = await db.insert(taskRuns).values({ ... }).returning()
```

**Multi-condition where:**
```typescript
const conditions = [eq(events.agentId, id)]
if (after) conditions.push(gt(events.timestamp, new Date(after)))
return db.select().from(events).where(and(...conditions))
```

**Update pattern:**
```typescript
await db.update(agents).set({ status, updatedAt: new Date() }).where(eq(agents.id, agentId))
```

**Schema** (`apps/server/src/db/schema.ts`): Drizzle table definitions use `pgTable` with UUID primary keys (`.primaryKey().defaultRandom()`). Relationships expressed via `.references(() => table.id)`. Indexes defined inline as the third argument to `pgTable`.

## Module Design

**Server tool modules** (`apps/server/src/tools/*.ts`):
- Each domain exports a single dispatcher: `export const execute<Domain>Tool = async (toolName, input, ...) => ToolResult`
- Internal handlers are unexported functions in the same file
- Routing from tool name to handler via a `Record<string, fn>` lookup table:
```typescript
const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
  getOrders,
  getProducts,
}
const handler = tools[toolName]
if (!handler) return { content: `Unknown finance tool: ${toolName}`, isError: true }
return handler(input)
```

**Route modules** (`apps/server/src/routes/*.ts`):
- Export a single `register<Domain>Routes(server: FastifyInstance)` function
- All route handlers are inline arrow functions (no separate named handlers)

**No barrel/index re-exports** within `apps/` — files import directly from source paths.

---

*Convention analysis: 2026-04-12*
