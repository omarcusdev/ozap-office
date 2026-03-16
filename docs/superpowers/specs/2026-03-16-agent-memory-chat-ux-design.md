# Agent Memory + Chat UX — Design Spec

## Overview

Two independent improvements to the ozap-office agent system:
1. **Two-tier agent memory** (MemGPT-style) — core + archival memory with agent-managed tools
2. **Chat UX overhaul** — conversation-scoped view with chat bubbles and collapsible internals

---

## 1. Agent Memory

### Problem

Agents are stateless between executions. Each task run starts fresh with only the system prompt and current input. Agents cannot track trends, remember decisions, or build context over time.

### Solution: Two-tier memory

**Core Memory** — small, permanent, always in context.
- Key-value pairs per agent (e.g., `current_mrr` → `R$15k, +8% MoM`)
- Stored in DB, injected into system prompt before every execution
- Agent explicitly manages via tools: add, update, delete
- Soft limit: ~20 keys per agent to keep prompt budget under control

**Archival Memory** — long-term storage, searched on demand.
- Free-text entries with a category tag
- Not injected automatically — agent searches when needed
- PostgreSQL text search (ILIKE), no vector DB required
- Never expires, accumulates indefinitely

### Database

New table `agent_memories`:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default random |
| agent_id | uuid | FK → agents |
| type | text | "core" or "archival" |
| key | text | nullable, unique per (agent_id, type) for core |
| category | text | nullable, for archival filtering |
| content | text | the memory content |
| created_at | timestamptz | default now |
| updated_at | timestamptz | default now |

Index on `(agent_id, type)` for core memory injection queries.
Index on `(agent_id, category)` for archival searches.
Unique constraint on `(agent_id, type, key)` where type = 'core'.

### Tools

Four new tools available to all agents (registered in `tool-executor.ts`):

**updateCoreMemory(key, content)** — upsert a core memory slot.
- If key exists for this agent, update content + updated_at
- If key doesn't exist, insert new row
- Returns confirmation with current core memory count

**deleteCoreMemory(key)** — remove a core memory slot.
- Returns confirmation or "key not found"

**saveToArchive(content, category)** — insert archival memory.
- Categories are free-form strings (e.g., "weekly_report", "anomaly", "decision")
- Returns confirmation with archive entry count for this agent

**searchArchive(query, category?, limit?)** — search archival memories.
- Searches content field with case-insensitive ILIKE `%query%`
- Optional category filter
- Default limit: 10
- Returns matching entries with timestamps

### Executor Integration

In `runtime/executor.ts`, before building the messages array:

1. Query all core memories for the agent (`type = 'core'`, ordered by `updated_at desc`)
2. Format as a text block:
```
## Your Current Memory
- current_mrr: R$15k, +8% MoM
- churn_rate: 2.3%, stable
- top_product: Zap GPT Vitalício
```
3. Append this block to the agent's system prompt before passing to Bedrock

If no core memories exist, skip the block entirely (no empty section).

### Tool Registration

Add memory tools to every agent's tool definitions in `db/seed.ts`. Each agent gets all four tools. The tool schemas follow the same pattern as existing tools (name, description, inputSchema).

New file: `tools/memory.ts` with `executeMemoryTool(agentId, toolName, input)`.
Register memory tool names in `tool-executor.ts` alongside leader and finance tools.

---

## 2. Chat UX

### Problems

1. Panel shows ALL events ever for the agent — overwhelming and irrelevant
2. User's sent message doesn't appear until server processes it — feels broken
3. Messages appear duplicated after processing completes
4. Long responses auto-scroll to bottom, user loses their place

### Solution

#### Scoped to last conversation

When opening a panel for an agent:
- Fetch the agent's most recent `task_run` (latest by `created_at`)
- Fetch events only for that task_run
- Show "Load previous conversations" button at the top to load the prior task_run

This replaces the current approach of fetching all events for an agent.

#### Chat bubble layout

Three visual types:

**User message** — right-aligned bubble with accent/gold background.
- Rendered from the task_run's `input.context` field or from optimistic local state
- Appears immediately on send (optimistic)

**Agent response** — left-aligned bubble with surface background.
- Rendered from events with type `message` or `completed`
- Markdown rendered via react-markdown

**Internal details** — collapsible section between user message and agent response.
- Contains: thinking, tool_call, tool_result events
- Collapsed by default, shows summary line: "Used 2 tools · 3.2s"
- Expandable to show full event timeline with left-border accent (existing EventItem style)

#### Optimistic message

When user sends a message:
1. Immediately append a local user bubble to the chat (not from server)
2. Show a typing indicator below it
3. As WebSocket events arrive, populate the internal details and response
4. Do NOT re-add user message when events arrive (deduplicate by checking if optimistic bubble exists)

State: `pendingMessage: string | null` in the ThoughtPanel component.

#### Smart auto-scroll

Replace the current "always scroll to bottom on events change" with:
1. Track if user is near bottom (within 100px of scroll end)
2. Only auto-scroll if user was already at the bottom
3. If user has scrolled up, preserve position — show a "↓ New activity" pill at bottom to jump down

#### WebSocket event handling

Current: events are fetched via API on agent select, and new events arrive via WebSocket.
Change: on agent select, fetch events for the latest task_run only (add `?taskRunId=X` query param to the events endpoint).

New endpoint or query param on existing:
`GET /api/agents/:id/events?taskRunId=<id>` — returns events for a specific task run.
`GET /api/agents/:id/latest-run` — returns the most recent task_run for the agent.

---

## Implementation Scope

### Files to create
- `apps/server/src/tools/memory.ts` — memory tool handlers
- `apps/server/drizzle/0002_*.sql` — migration for agent_memories table

### Files to modify
- `apps/server/src/db/schema.ts` — add agent_memories table
- `apps/server/src/runtime/tool-executor.ts` — register memory tools
- `apps/server/src/runtime/executor.ts` — inject core memory into prompt
- `apps/server/src/db/seed.ts` — add memory tools to all agents
- `apps/server/src/routes/agents.ts` — add latest-run endpoint, taskRunId filter
- `apps/web/lib/components/thought-panel.tsx` — full chat UX rewrite
- `apps/web/lib/use-events.ts` — scope events to task run
- `apps/web/lib/api-client.ts` — add new API methods
- `packages/shared/src/types.ts` — add memory types

### Files NOT modified
- Canvas rendering, sprite system, tile map — untouched
- WebSocket protocol — existing message types sufficient
- Meeting system — untouched
- Approval system — untouched
