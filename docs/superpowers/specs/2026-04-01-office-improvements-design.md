# Ozap Office — Comprehensive Improvements Design

## Overview

A foundation rebuild + 4 feature additions to make the virtual AI office functional and usable. The current implementation has broken markdown rendering, invisible leader delegation, a non-functional meeting room, and no conversation history management. The approach is **foundation first, then features** — migrate to modern state/data/UI libraries, then build each feature on the solid base.

## Scope

**In scope:**
- Foundation rebuild: Zustand, TanStack Query, shadcn/ui, markdown pipeline
- Chat UX: session-based conversation history
- Leader delegation visibility: sub-conversation threads
- Meeting room: free discussion model with multi-agent parallel responses + cross-reactions

**Out of scope:**
- Canvas/isometric rendering changes
- New agents or tools
- Deployment/infrastructure changes
- Mobile responsiveness

## Phase 1: Foundation Rebuild

### 1.1 State Management — Zustand

Replace the single `OfficeContext` in `providers.tsx` with focused Zustand stores:

| Store | Replaces | Responsibility |
|---|---|---|
| `useAgentStore` | `useAgents` state | Agent list, statuses, selected agent |
| `useConversationStore` | `useConversation` | Active session, messages, session list per agent |
| `useEventStore` | `useEvents` | Real-time events per agent, delegation sub-events |
| `useMeetingStore` | New | Active meeting, messages, meeting state machine |
| `useWebSocketStore` | `useWebSocket` state | Connection state, subscribe/unsubscribe |

Agent animation logic (RAF loop, sprite frames, waypoint pathfinding) is extracted to `use-agents-animation.ts` — it stays as a hook since it's tightly coupled to the canvas render cycle.

`providers.tsx` simplifies to:
```
<QueryClientProvider>
  <WebSocketProvider>
    {children}
  </WebSocketProvider>
</QueryClientProvider>
```

WebSocketProvider's only job: manage connection lifecycle and route incoming messages to the appropriate Zustand store.

### 1.2 Data Fetching — TanStack Query

Replace all manual `useEffect` + `fetch` + `setState` patterns:

| Query Hook | Endpoint | Replaces |
|---|---|---|
| `useAgentsQuery()` | `GET /api/agents` | Manual fetch in `useAgents` |
| `useConversationQuery(agentId, sessionId)` | `GET /api/agents/:id/sessions/:sid/messages` | Manual fetch in `useConversation` |
| `useSessionsQuery(agentId)` | `GET /api/agents/:id/sessions` | New |
| `useTaskRunQuery(agentId)` | `GET /api/agents/:id/task-runs/latest` | Manual fetch in `useEvents` |
| `useMeetingQuery(meetingId)` | `GET /api/meetings/:id/messages` | New |

Benefits: automatic caching, deduplication, background refetch, optimistic updates for message sending.

### 1.3 UI Components — shadcn/ui

Install shadcn/ui via CLI. Components copied to `lib/components/ui/`. Theme mapped from existing CSS variables:

| CSS Variable | shadcn Token |
|---|---|
| `--color-canvas` (#0f0e0c) | `--background` |
| `--color-surface` (#1a1916) | `--card` |
| `--color-raised` (#242220) | `--muted` |
| `--color-cream` (#e5dfd3) | `--foreground` |
| `--color-sand` (#8a8478) | `--muted-foreground` |
| `--color-gold` (#c89b3c) | `--primary` |
| `--color-sage` (#7ab87a) | `--accent` (contextual) |
| `--color-coral` (#c75450) | `--destructive` |
| `--color-edge` (#2e2b27) | `--border` |

Key shadcn components: `ScrollArea`, `Sheet`, `DropdownMenu`, `Collapsible`, `Badge`, `Tabs`, `Separator`, `Button`, `Input`, `Textarea`, `Table`, `Dialog`.

### 1.4 Markdown Pipeline

New `markdown-renderer.tsx` component replacing bare `<Markdown>`:

**Dependencies:**
- `react-markdown` (keep v10.1.0)
- `remark-gfm` (add) — tables, strikethrough, autolinks, task lists
- `rehype-highlight` + `highlight.js` (add) — code syntax highlighting

**Custom component overrides:**
- `table` → shadcn/ui `Table` component (styled with existing dark theme)
- `code` / `pre` → syntax-highlighted code block with copy button
- `a` → external link indicator, opens in new tab
- `img` → constrained width, lazy loading

**Prose styling retained** via `@tailwindcss/typography` but extended with table-specific overrides.

## Phase 2: Chat UX — Session-Based Conversations

### 2.1 Database Changes

New table `conversation_sessions`:

```sql
CREATE TABLE conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Add column to `conversation_messages`:
```sql
ALTER TABLE conversation_messages ADD COLUMN session_id UUID REFERENCES conversation_sessions(id);
```

Title auto-generated from first user message (truncated to 50 chars).

### 2.2 API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agents/:id/sessions` | List sessions (newest first) |
| `POST` | `/api/agents/:id/sessions` | Create new session |
| `DELETE` | `/api/agents/:id/sessions/:sid` | Delete session + messages |
| `GET` | `/api/agents/:id/sessions/:sid/messages` | Messages for session |

Existing `DELETE /api/agents/:id/conversation` clears the active session.

### 2.3 Frontend — Session Picker

Top of ThoughtPanel: dropdown showing current session title + "New Conversation" button.

- Dropdown lists past sessions: title + relative date + message count
- Click session to load it
- Delete session via trash icon
- Active session highlighted
- Empty state: "Start a conversation with {agent name}"

### 2.4 Conversation Flow

1. User opens agent → loads most recent session (or empty state)
2. User types message → auto-creates session if none active
3. Messages append to current session
4. "New Conversation" → creates session, clears chat
5. Pick old session from dropdown → loads that session's messages
6. Bedrock conversation history scoped to active session (agent context resets per session)

## Phase 3: Leader Delegation Visibility

### 3.1 New Event Types

| Event Type | Emitted On | Metadata |
|---|---|---|
| `delegation_start` | Leader's task run | `{ targetAgentId, targetAgentName, question, delegationId }` |
| `delegation_response` | Leader's task run | `{ targetAgentId, targetAgentName, response, delegationId, events: [...] }` |

### 3.2 Backend Changes — `tools/leader.ts`

**`askAgent()`:**
1. Emit `delegation_start` on Leader's task run with the question
2. Call `executeAgentForMeeting(agentId, question)`
3. Emit `delegation_response` with the agent's answer + any tool calls made

**`delegateTask()`:**
1. Emit `delegation_start` immediately
2. Launch `executeAgent()` async
3. Register a completion listener that emits `delegation_response` when done

Both use a `delegationId` (nanoid) to pair start/response events.

### 3.3 Frontend — Sub-Thread Component

`delegation-thread.tsx` — renders inside ThoughtPanel for Leader's chat:

- `delegation_start` + `delegation_response` pair as a **collapsible section**
- Collapsed: "Asked {Agent Name}" + chevron icon, colored by agent color
- Expanded shows:
  - The question/task sent
  - Tool calls the delegated agent made (if any)
  - The agent's response
- Collapsed by default to keep Leader's chat clean
- Color-coded left border using the target agent's color

No WebSocket changes needed — delegation events are emitted under the Leader's agentId, so they naturally arrive when viewing the Leader.

## Phase 4: Functional Meeting Room

### 4.1 Meeting State Machine

```
idle → starting → active → concluding → completed
```

- `idle`: Button says "Call Meeting"
- `starting`: Agents animate to room. `POST /api/meetings` creates meeting.
- `active`: Meeting panel open. User sends messages. Agents respond.
- `concluding`: Agents animate back. Meeting marked completed.
- `completed`: Archived, browsable.

### 4.2 Backend — Meeting Engine (`runtime/meeting-engine.ts`)

When user sends a meeting message:

**Phase 1 — Parallel Responses:**
- Execute all agents in parallel
- Each agent gets: system prompt + `"Meeting topic: {topic}. User said: {message}. Respond from your area of expertise."`
- Broadcast each response via WebSocket as it completes (real-time streaming)

**Phase 2 — Cross-Reactions:**
- After all initial responses, each agent gets the full transcript
- Lightweight check prompt: "Given these responses, do you have something to add, disagree with, or build upon? If not, respond with exactly PASS."
- Agents that PASS are silent. Others respond.
- Broadcast reactions in real-time.

**Phase 3 — Convergence:**
- If any agent reacted in Phase 2, one more round with the same check
- Max 2 reaction rounds to prevent infinite loops
- Emit `meeting_round_complete` after each phase

### 4.3 Database Changes

Update `meeting_messages`:

```sql
ALTER TABLE meeting_messages ADD COLUMN agent_id UUID REFERENCES agents(id);
ALTER TABLE meeting_messages ADD COLUMN round INTEGER DEFAULT 1;
-- metadata already exists as JSONB, will include { phase: "response"|"reaction" }
```

`sender` column kept for backward compat but `agent_id` is the proper FK.

### 4.4 Frontend — Meeting Panel

When meeting is active, ThoughtPanel transforms into `meeting-panel.tsx`:

- Header: meeting topic + participant avatar dots
- Messages as group chat:
  - User messages: right-aligned, gold theme
  - Agent messages: left-aligned, agent name + colored dot, markdown rendered
  - Round separators: "— Initial Responses —", "— Discussion —"
- Per-agent typing indicators: "{Agent} is thinking..."
- Input at bottom sends to meeting endpoint
- "End Meeting" button archives and animates agents back

### 4.5 WebSocket — Meeting Events

The existing `meeting_message` broadcast in `websocket.ts` already works. Frontend `handleWsMessage` gets a new branch:

```typescript
if (message.type === "meeting_message") {
  useMeetingStore.getState().addMessage(message.payload)
}
```

Meeting messages include `agentId`, `round`, and `phase` in metadata for proper rendering.

## File Structure

### Frontend — New/Modified Files

```
apps/web/lib/
├── components/
│   ├── ui/                      # NEW — shadcn components
│   ├── thought-panel.tsx        # REFACTORED — uses stores + new components
│   ├── meeting-panel.tsx        # NEW
│   ├── session-picker.tsx       # NEW
│   ├── delegation-thread.tsx    # NEW
│   ├── markdown-renderer.tsx    # NEW
│   ├── office-canvas.tsx        # UNCHANGED
│   └── status-bar.tsx           # MINOR UPDATES
├── stores/
│   ├── agent-store.ts           # NEW
│   ├── conversation-store.ts    # NEW
│   ├── event-store.ts           # NEW
│   ├── meeting-store.ts         # NEW
│   └── ws-store.ts              # NEW
├── hooks/
│   ├── use-agents-animation.ts  # EXTRACTED from use-agents.ts
│   └── use-websocket.ts         # SIMPLIFIED
├── queries/
│   ├── agent-queries.ts         # NEW
│   ├── conversation-queries.ts  # NEW
│   ├── session-queries.ts       # NEW
│   └── meeting-queries.ts       # NEW
├── api-client.ts                # EXTENDED
├── ws-client.ts                 # UNCHANGED
└── canvas/                      # UNCHANGED
```

### Backend — New/Modified Files

```
apps/server/src/
├── db/
│   └── schema.ts                # ADD conversation_sessions, UPDATE meeting_messages
├── routes/
│   ├── agents.ts                # ADD session endpoints
│   └── meetings.ts              # UPDATE with new meeting flow
├── runtime/
│   ├── executor.ts              # ADD delegation event emission
│   └── meeting-engine.ts        # NEW
├── tools/
│   └── leader.ts                # EMIT delegation events
└── events/
    └── websocket.ts             # UNCHANGED
```

### Shared Types

```
packages/shared/src/types.ts     # ADD: ConversationSession, delegation event types, meeting round types
```

## Package Changes

### Frontend — Add

| Package | Purpose |
|---|---|
| `zustand` | State management |
| `@tanstack/react-query` | Data fetching/caching |
| `remark-gfm` | GFM markdown (tables, strikethrough) |
| `rehype-highlight` | Code syntax highlighting |
| `highlight.js` | Syntax highlighting engine |
| `lucide-react` | Icons (shadcn dependency) |
| shadcn/ui (CLI install) | UI component primitives |

### Frontend — Keep

| Package | Reason |
|---|---|
| `react-markdown` | Core markdown renderer |
| `@tailwindcss/typography` | Prose styling for markdown content |

### Backend — No Changes

No new backend dependencies needed.

## Migration Strategy

Each phase is a deployable increment:

1. **Phase 1** deploys with the new foundation but same features — no user-visible regression
2. **Phase 2** adds session UI — conversations still work, just organized better
3. **Phase 3** adds delegation visibility — Leader chat gets richer
4. **Phase 4** activates meeting room — biggest visible change

Phases can be deployed independently. Each phase includes its own DB migrations.
