# Agent Memory + Chat UX Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two-tier agent memory (core + archival) and overhaul the chat panel UX with conversation-scoped bubbles.

**Architecture:** Server gets a new `agent_memories` table, `tools/memory.ts` handler, and core memory injection in the executor. Frontend ThoughtPanel is rewritten with chat bubbles, scoped events, optimistic send, and smart scroll. Two independent workstreams that share only the types package.

**Tech Stack:** Drizzle ORM, Fastify, Bedrock Converse API, React 19, Next.js 15, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-03-16-agent-memory-chat-ux-design.md`

---

## Chunk 1: Agent Memory (Backend)

### Task 1: Database schema + migration

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create: migration via `drizzle-kit generate`

- [ ] **Step 1: Add agent_memories table to schema**

In `apps/server/src/db/schema.ts`, add after the `approvals` table:

```typescript
export const agentMemories = pgTable(
  "agent_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    type: text("type").notNull(),
    key: text("key"),
    category: text("category"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_memories_agent_type_idx").on(table.agentId, table.type),
    index("agent_memories_agent_category_idx").on(table.agentId, table.category),
  ]
)
```

- [ ] **Step 2: Generate migration**

Run from `apps/server`:
```bash
pnpm db:generate
```

Expected: new file `apps/server/drizzle/0002_*.sql` with CREATE TABLE for `agent_memories`.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/
git commit -m "feat: add agent_memories table schema and migration"
```

---

### Task 2: Memory tool handlers

**Files:**
- Create: `apps/server/src/tools/memory.ts`

- [ ] **Step 1: Create memory tool handler**

Create `apps/server/src/tools/memory.ts`:

```typescript
import { db } from "../db/client.js"
import { agentMemories } from "../db/schema.js"
import { eq, and, ilike, desc } from "drizzle-orm"

type ToolResult = { content: string; isError?: boolean }

const updateCoreMemory = async (agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  const key = input.key as string
  const content = input.content as string

  if (!key || !content) {
    return { content: "Both key and content are required", isError: true }
  }

  const existing = await db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.type, "core"), eq(agentMemories.key, key)))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(agentMemories)
      .set({ content, updatedAt: new Date() })
      .where(eq(agentMemories.id, existing[0].id))
  } else {
    await db.insert(agentMemories).values({ agentId, type: "core", key, content })
  }

  const count = await db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.type, "core")))

  return { content: `Core memory "${key}" saved. You have ${count.length} core memories.` }
}

const deleteCoreMemory = async (agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  const key = input.key as string
  if (!key) return { content: "key is required", isError: true }

  const existing = await db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.type, "core"), eq(agentMemories.key, key)))
    .limit(1)

  if (existing.length === 0) return { content: `Core memory "${key}" not found` }

  await db.delete(agentMemories).where(eq(agentMemories.id, existing[0].id))
  return { content: `Core memory "${key}" deleted.` }
}

const saveToArchive = async (agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  const content = input.content as string
  const category = (input.category as string) ?? "general"

  if (!content) return { content: "content is required", isError: true }

  await db.insert(agentMemories).values({ agentId, type: "archival", category, content })

  const count = await db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.type, "archival")))

  return { content: `Archived under "${category}". You have ${count.length} archival memories.` }
}

const searchArchive = async (agentId: string, input: Record<string, unknown>): Promise<ToolResult> => {
  const query = input.query as string
  const category = input.category as string | undefined
  const limit = (input.limit as number) ?? 10

  if (!query) return { content: "query is required", isError: true }

  const conditions = [
    eq(agentMemories.agentId, agentId),
    eq(agentMemories.type, "archival"),
    ilike(agentMemories.content, `%${query}%`),
  ]
  if (category) conditions.push(eq(agentMemories.category, category))

  const results = await db
    .select()
    .from(agentMemories)
    .where(and(...conditions))
    .orderBy(desc(agentMemories.createdAt))
    .limit(limit)

  if (results.length === 0) return { content: "No archival memories found matching your query." }

  const formatted = results.map((m) =>
    `[${m.category ?? "general"}] (${new Date(m.createdAt).toISOString().split("T")[0]}): ${m.content}`
  ).join("\n\n")

  return { content: `Found ${results.length} memories:\n\n${formatted}` }
}

export const executeMemoryTool = async (
  agentId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (agentId: string, input: Record<string, unknown>) => Promise<ToolResult>> = {
    updateCoreMemory,
    deleteCoreMemory,
    saveToArchive,
    searchArchive,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown memory tool: ${toolName}`, isError: true }

  return handler(agentId, input)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/tools/memory.ts
git commit -m "feat: add memory tool handlers (core + archival)"
```

---

### Task 3: Register memory tools in executor

**Files:**
- Modify: `apps/server/src/runtime/tool-executor.ts`

- [ ] **Step 1: Add memory tools to tool-executor**

In `apps/server/src/runtime/tool-executor.ts`, add the import and registration:

Add import at top:
```typescript
import { executeMemoryTool } from "../tools/memory.js"
```

Add constant:
```typescript
const MEMORY_TOOLS = ["updateCoreMemory", "deleteCoreMemory", "saveToArchive", "searchArchive"]
```

Add routing in `executeTool` before the "Unknown tool" fallback:
```typescript
if (MEMORY_TOOLS.includes(toolName)) {
  return executeMemoryTool(agentId, toolName, toolInput)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/runtime/tool-executor.ts
git commit -m "feat: register memory tools in tool executor"
```

---

### Task 4: Inject core memory into system prompt

**Files:**
- Modify: `apps/server/src/runtime/executor.ts`

- [ ] **Step 1: Add core memory injection**

In `apps/server/src/runtime/executor.ts`:

Add import at top:
```typescript
import { agentMemories } from "../db/schema.js"
import { and } from "drizzle-orm"
```

Note: `eq` is already imported; add `and` to the existing import from `drizzle-orm`.

Add helper function before `executeAgent`:
```typescript
const buildCoreMemoryBlock = async (agentId: string): Promise<string> => {
  const memories = await db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.type, "core")))
    .orderBy(agentMemories.updatedAt)

  if (memories.length === 0) return ""

  const lines = memories.map((m) => `- ${m.key}: ${m.content}`).join("\n")
  return `\n\n## Your Current Memory\n${lines}`
}
```

In `executeAgent`, after fetching the agent (line 56) and before the `runAgenticLoop` call (line 82), add:
```typescript
const coreMemoryBlock = await buildCoreMemoryBlock(agentId)
```

Change the `runAgenticLoop` call to pass the augmented prompt. Modify the `runAgenticLoop` function signature to accept `systemPrompt` as a separate parameter instead of reading from `agent`:

In `runAgenticLoop`, change:
```typescript
systemPrompt: agent.systemPrompt,
```
to use the passed parameter. The simplest approach: augment the agent object before passing:

After `const coreMemoryBlock = ...`:
```typescript
const systemPromptWithMemory = agent.systemPrompt + coreMemoryBlock
```

Then in the three places that call `runAgenticLoop` and `converse` with `agent.systemPrompt`, ensure the augmented version is used. The cleanest change: modify the `agent` object spread:

Replace line 82:
```typescript
const failed = await runAgenticLoop(agent, taskRun.id, messages, agentTools, bedrockTools)
```
with:
```typescript
const agentWithMemory = { ...agent, systemPrompt: systemPromptWithMemory }
const failed = await runAgenticLoop(agentWithMemory, taskRun.id, messages, agentTools, bedrockTools)
```

Also apply the same pattern in `executeAgentForMeeting` (line 166-188). Add `buildCoreMemoryBlock` call and spread.

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/runtime/executor.ts
git commit -m "feat: inject core memory into agent system prompt"
```

---

### Task 5: Add memory tools to agent seed

**Files:**
- Modify: `apps/server/src/db/seed.ts`

- [ ] **Step 1: Define memory tool schemas**

In `apps/server/src/db/seed.ts`, add a `memoryTools` array after `financeTools`:

```typescript
const memoryTools = [
  {
    name: "updateCoreMemory",
    description: "Save or update a key-value pair in your permanent core memory. Core memory is always available to you at the start of every execution. Use this to remember important metrics, decisions, observations, and ongoing situations.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Short descriptive key (e.g., 'current_mrr', 'top_product', 'campaign_status')" },
        content: { type: "string", description: "The value to remember. Keep concise but informative." },
      },
      required: ["key", "content"],
    },
  },
  {
    name: "deleteCoreMemory",
    description: "Remove a key from your core memory when it is no longer relevant.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "The key to delete" },
      },
      required: ["key"],
    },
  },
  {
    name: "saveToArchive",
    description: "Save a detailed observation, report, or analysis to long-term archival memory. Use this for information you might need later but don't need in every execution. Archived memories can be searched with searchArchive.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The content to archive" },
        category: { type: "string", description: "Category tag (e.g., 'weekly_report', 'anomaly', 'decision', 'metric')" },
      },
      required: ["content"],
    },
  },
  {
    name: "searchArchive",
    description: "Search your long-term archival memory for past observations, reports, or data. Returns matching entries with timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term to find in archived memories" },
        category: { type: "string", description: "Optional: filter by category" },
        limit: { type: "number", description: "Max results to return (default 10)" },
      },
      required: ["query"],
    },
  },
]
```

- [ ] **Step 2: Add memory tools to each agent's tools array**

In the `agentsToSeed` array, append `...memoryTools` to every agent's `tools` array:

- Leader: `tools: [...leaderTools, ...memoryTools]`
- Instagram: `tools: [...memoryTools]`
- Sales: `tools: [...memoryTools]`
- Ads: `tools: [...memoryTools]`
- Finance: `tools: [...financeTools, ...memoryTools]`
- PM: `tools: [...memoryTools]`

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/db/seed.ts
git commit -m "feat: add memory tools to all agent seed definitions"
```

---

### Task 6: Add memory types to shared package

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add AgentMemory type**

At the end of `packages/shared/src/types.ts`, add:

```typescript
export type AgentMemoryType = "core" | "archival"

export type AgentMemory = {
  id: string
  agentId: string
  type: AgentMemoryType
  key: string | null
  category: string | null
  content: string
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add AgentMemory types to shared package"
```

---

### Task 7: Run migration + seed on production

- [ ] **Step 1: Push all changes**

```bash
git push origin main
```

- [ ] **Step 2: Deploy to EC2**

Run the full deploy command from CLAUDE.md (git pull, build, migrate, seed, restart PM2). The migration creates the `agent_memories` table. The seed updates all agents with memory tools.

- [ ] **Step 3: Verify**

Trigger the Finance agent: "Gere um resumo de receita da ultima semana e salve na sua memória."

Check that the agent calls `updateCoreMemory` and/or `saveToArchive`. Verify via psql: `SELECT * FROM agent_memories LIMIT 10;`

---

## Chunk 2: Chat UX (Backend API + Frontend)

### Task 8: Add latest-run and taskRunId filter to API

**Files:**
- Modify: `apps/server/src/routes/agents.ts`

- [ ] **Step 1: Add GET /api/agents/:id/latest-run endpoint**

In `apps/server/src/routes/agents.ts`, add after the existing events route:

```typescript
server.get<{ Params: { id: string } }>("/api/agents/:id/latest-run", async (request, reply) => {
  const [latestRun] = await db
    .select()
    .from(taskRuns)
    .where(eq(taskRuns.agentId, request.params.id))
    .orderBy(desc(taskRuns.createdAt))
    .limit(1)

  if (!latestRun) return reply.code(404).send({ error: "No task runs found" })
  return latestRun
})
```

Add `desc` to the imports from `drizzle-orm`:
```typescript
import { eq, gt, and, desc } from "drizzle-orm"
```

Also import `taskRuns`:
```typescript
import { agents, events, taskRuns } from "../db/schema.js"
```

- [ ] **Step 2: Add taskRunId filter to existing events endpoint**

Modify the existing `/api/agents/:id/events` route to support `?taskRunId=`:

```typescript
server.get<{
  Params: { id: string }
  Querystring: { after?: string; taskRunId?: string }
}>("/api/agents/:id/events", async (request) => {
  const { id } = request.params
  const { after, taskRunId } = request.query

  const conditions = [eq(events.agentId, id)]
  if (after) conditions.push(gt(events.timestamp, new Date(after)))
  if (taskRunId) conditions.push(eq(events.taskRunId, taskRunId))

  return db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(events.timestamp)
    .limit(100)
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes/agents.ts
git commit -m "feat: add latest-run endpoint and taskRunId filter for events"
```

---

### Task 9: Update API client

**Files:**
- Modify: `apps/web/lib/api-client.ts`

- [ ] **Step 1: Add new API methods**

In `apps/web/lib/api-client.ts`, add to the `api` object:

```typescript
getLatestRun: (agentId: string) =>
  request<TaskRun>(`/api/agents/${agentId}/latest-run`),
getTaskRunEvents: (agentId: string, taskRunId: string) =>
  request<AgentEvent[]>(`/api/agents/${agentId}/events?taskRunId=${taskRunId}`),
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/api-client.ts
git commit -m "feat: add latest-run and taskRunId events to API client"
```

---

### Task 10: Rewrite useEvents hook

**Files:**
- Modify: `apps/web/lib/use-events.ts`

- [ ] **Step 1: Scope events to latest task run**

Replace `apps/web/lib/use-events.ts` entirely:

```typescript
"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "./api-client"
import type { AgentEvent } from "@ozap-office/shared"

export const useEvents = (agentId: string | null) => {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [activeTaskRunId, setActiveTaskRunId] = useState<string | null>(null)

  useEffect(() => {
    if (!agentId) {
      setEvents([])
      setActiveTaskRunId(null)
      return
    }

    api.getLatestRun(agentId)
      .then((run) => {
        setActiveTaskRunId(run.id)
        return api.getTaskRunEvents(agentId, run.id)
      })
      .then(setEvents)
      .catch(() => {
        setEvents([])
        setActiveTaskRunId(null)
      })
  }, [agentId])

  const addEvent = useCallback(
    (event: AgentEvent) => {
      if (activeTaskRunId && event.taskRunId !== activeTaskRunId) {
        setActiveTaskRunId(event.taskRunId)
        setEvents([event])
        return
      }
      setEvents((prev) => [...prev, event])
    },
    [activeTaskRunId]
  )

  return { events, addEvent, activeTaskRunId }
}
```

Key changes:
- Fetches latest task run first, then events for that run only
- `addEvent` checks if incoming event is for a new task run (user triggered a new one) and resets
- Exposes `activeTaskRunId` for use in ThoughtPanel

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/use-events.ts
git commit -m "feat: scope useEvents to latest task run"
```

---

### Task 11: Rewrite ThoughtPanel with chat bubbles

**Files:**
- Modify: `apps/web/lib/components/thought-panel.tsx`

- [ ] **Step 1: Full rewrite of ThoughtPanel**

Replace `apps/web/lib/components/thought-panel.tsx` with the new chat bubble layout. Key changes from current implementation:

**Data flow:**
- Extract user message from `events` by finding the task_run input or looking at the first event context
- Group events into: user message → internal details (thinking/tool_call/tool_result) → agent response (message/completed)
- Show optimistic user bubble immediately on send

**Components to build inside the file:**
- `UserBubble` — right-aligned, gold/accent background, shows user's message
- `AgentBubble` — left-aligned, surface background, Markdown rendered
- `InternalDetails` — collapsible, shows event count + time, expands to show EventItem list
- `TypingIndicator` — animated dots shown while agent is working
- `NewActivityPill` — "↓ New activity" button shown when user scrolled up and new events arrive

**Smart scroll logic:**
- `useRef` to track scroll container
- Before event update, check if `scrollTop + clientHeight >= scrollHeight - 100`
- If yes, auto-scroll after update. If no, show the pill.

**Optimistic send:**
- On send: set `pendingMessage` state, show UserBubble immediately
- When first event arrives for a new task run, clear `pendingMessage`

The full component code is large (~200 lines). Key structural changes:

```tsx
// Message grouping helper
const groupEventsIntoConversation = (events: AgentEvent[], pendingMessage: string | null) => {
  // Find the user input (from first event's task run, or pending message)
  // Group thinking/tool_call/tool_result as internal
  // Group message/completed as agent response
  // Returns: { userMessage, internalEvents, agentResponse, isProcessing }
}
```

The render structure:
```tsx
<div ref={scrollRef} className="flex-1 overflow-y-auto">
  {userMessage && <UserBubble text={userMessage} />}
  {internalEvents.length > 0 && <InternalDetails events={internalEvents} />}
  {agentResponse && <AgentBubble content={agentResponse} agentColor={selectedAgent.color} />}
  {isProcessing && <TypingIndicator />}
  {showNewActivityPill && <NewActivityPill onClick={scrollToBottom} />}
</div>
```

Use the warm design system colors (cream, sand, mute, gold, raised, surface, edge) already in globals.css.

- [ ] **Step 2: Update providers to pass activeTaskRunId**

In `apps/web/app/providers.tsx`, the `useEvents` hook now returns `activeTaskRunId`. Update the WebSocket handler to only add events for the active task run (or new task runs):

```typescript
const { events, addEvent, activeTaskRunId } = useEvents(selectedAgentId)
```

The `addEvent` already handles new task run detection internally, so the providers change is minimal — just destructure the new field.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/components/thought-panel.tsx apps/web/app/providers.tsx
git commit -m "feat: rewrite thought panel with chat bubbles and smart scroll"
```

---

### Task 12: Deploy and verify

- [ ] **Step 1: Typecheck**

```bash
pnpm -F @ozap-office/web typecheck
pnpm -F @ozap-office/server typecheck
```

- [ ] **Step 2: Push and deploy**

```bash
git push origin main
```

Run full deploy command (git pull, pnpm install, build all, migrate, seed, restart PM2).

- [ ] **Step 3: Verify memory**

1. Open production, click Finance agent
2. Send: "Gere o resumo de receita da ultima semana e salve os dados importantes na sua memória"
3. Verify agent calls `updateCoreMemory` and/or `saveToArchive` in the internal details
4. Send another message — verify the "Your Current Memory" block appears in the system prompt (check server logs)

- [ ] **Step 4: Verify chat UX**

1. Open production, click an agent with no history → see "No activity yet"
2. Send a message → user bubble appears immediately (optimistic)
3. Wait for response → typing indicator shows, then agent bubble with Markdown
4. Internal details collapsed by default → click to expand, see tool calls
5. Scroll up during long response → position preserved, "↓ New activity" pill appears
6. Click another agent → panel resets to that agent's latest conversation
