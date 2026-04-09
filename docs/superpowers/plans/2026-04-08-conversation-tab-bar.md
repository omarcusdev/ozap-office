# Conversation Tab Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dropdown-based SessionPicker with a horizontal tab bar that keeps "New conversation" always visible and pinned to the left.

**Architecture:** New `SessionTabBar` component replaces `SessionPicker`. Same Zustand store and TanStack Query mutations — only the UI layer changes. The tab bar sits between the agent header and the message area in `ThoughtPanel`.

**Tech Stack:** React 19, Tailwind v4, Zustand, TanStack Query, lucide-react

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/lib/components/session-tab-bar.tsx` | Create | Horizontal tab bar with pinned "+" and session tabs |
| `apps/web/lib/components/thought-panel.tsx` | Modify (lines 11, 321-364) | Replace SessionPicker import/usage with SessionTabBar |
| `apps/web/lib/components/session-picker.tsx` | Delete | No longer needed |

---

### Task 1: Create SessionTabBar component

**Files:**
- Create: `apps/web/lib/components/session-tab-bar.tsx`

- [ ] **Step 1: Create the component file**

```tsx
"use client"

import { Plus, X } from "lucide-react"
import { useConversationStore } from "@/lib/stores/conversation-store"
import { useCreateSessionMutation, useDeleteSessionMutation } from "@/lib/queries/session-queries"

type SessionTabBarProps = {
  agentId: string
}

export const SessionTabBar = ({ agentId }: SessionTabBarProps) => {
  const sessions = useConversationStore((s) => s.sessions)
  const activeSessionId = useConversationStore((s) => s.activeSessionId)
  const setActiveSessionId = useConversationStore((s) => s.setActiveSessionId)
  const createSession = useCreateSessionMutation(agentId)
  const deleteSession = useDeleteSessionMutation(agentId)

  const handleNewSession = () => {
    if (createSession.isPending) return
    createSession.mutate(undefined, {
      onSuccess: (session) => {
        setActiveSessionId(session.id)
      },
    })
  }

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    deleteSession.mutate(sessionId)
  }

  return (
    <div className="flex items-center border-b border-edge bg-[#1e1c19] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        onClick={handleNewSession}
        disabled={createSession.isPending}
        className="shrink-0 px-3 py-2 border-r border-edge text-gold hover:text-gold-light disabled:text-mute transition-colors"
        title="New conversation"
      >
        <Plus className="w-4 h-4" />
      </button>
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId
        return (
          <button
            key={session.id}
            onClick={() => setActiveSessionId(session.id)}
            className={`group shrink-0 flex items-center gap-1.5 px-3.5 py-2 font-mono text-[11px] transition-colors ${
              isActive
                ? "text-gold border-b-2 border-gold bg-surface"
                : "text-sand hover:text-cream"
            }`}
          >
            <span className="truncate max-w-[120px]">
              {session.title ?? "Untitled"}
            </span>
            {!isActive && (
              <span
                onClick={(e) => handleDeleteSession(e, session.id)}
                className="opacity-0 group-hover:opacity-100 text-mute hover:text-coral transition-all"
              >
                <X className="w-2.5 h-2.5" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: No errors related to `session-tab-bar.tsx`

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/components/session-tab-bar.tsx
git commit -m "feat: add SessionTabBar component with pinned new-conversation button"
```

---

### Task 2: Wire SessionTabBar into ThoughtPanel and remove SessionPicker

**Files:**
- Modify: `apps/web/lib/components/thought-panel.tsx` (lines 11, 321-364)
- Delete: `apps/web/lib/components/session-picker.tsx`

- [ ] **Step 1: Update the import in thought-panel.tsx**

Replace line 11:
```tsx
// old
import { SessionPicker } from "./session-picker"
// new
import { SessionTabBar } from "./session-tab-bar"
```

- [ ] **Step 2: Remove SessionPicker from inside the header and add SessionTabBar between header and message area**

The header section currently spans lines 321-364. The `SessionPicker` is rendered at lines 361-363 inside the header `<div>`. Remove those lines and the status `<div>` wrapper's bottom margin.

The new structure should be:

```tsx
{selectedAgent && (
  <>
    <div className="p-5 border-b border-edge">
      {/* agent avatar, name, role, close button — unchanged */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3.5">
          <div
            className="w-10 h-10 rounded-sm flex items-center justify-center text-base font-bold text-canvas"
            style={{ backgroundColor: selectedAgent.color }}
          >
            {selectedAgent.name[0]}
          </div>
          <div>
            <h3 className="font-semibold text-[15px] text-cream leading-tight">{selectedAgent.name}</h3>
            <p className="text-xs text-sand mt-0.5">{selectedAgent.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {conversation.length > 0 && (
            <button
              onClick={() => clearConversationMutation.mutate()}
              className="text-mute hover:text-sand transition-colors p-1"
              title="Clear conversation"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 4h9M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1M8.5 6.5v4M5.5 6.5v4M3.5 4l.5 7a1 1 0 001 1h4a1 1 0 001-1l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button
            onClick={() => selectAgent(null)}
            className="text-mute hover:text-sand transition-colors p-1 -mr-1 -mt-0.5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
        <span className="text-[11px] font-mono text-sand tracking-wide">{selectedAgent.status}</span>
      </div>
    </div>

    <SessionTabBar agentId={selectedAgentId!} />

    <div ref={scrollRef} onScroll={checkNearBottom} className="flex-1 overflow-y-auto relative">
      {/* ...message area unchanged... */}
    </div>
    {/* ...input area unchanged... */}
  </>
)}
```

Key changes:
- Remove lines 361-363 (`<div className="mt-3"><SessionPicker agentId={selectedAgentId!} /></div>`)
- Add `<SessionTabBar agentId={selectedAgentId!} />` between the header's closing `</div>` and the message scroll area `<div ref={scrollRef}>`

- [ ] **Step 3: Delete session-picker.tsx**

```bash
rm apps/web/lib/components/session-picker.tsx
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: No errors. No remaining references to `SessionPicker` or `session-picker`.

- [ ] **Step 5: Verify no dangling imports**

Run: `grep -r "session-picker" apps/web/`
Expected: No results.

- [ ] **Step 6: Visual verification**

Run: `pnpm dev:web`
Open the app, click an agent, verify:
1. Tab bar appears between header and messages
2. "+" button is pinned to the left
3. Clicking "+" creates a new session tab and selects it
4. Clicking a tab switches conversations
5. Hovering an inactive tab shows "×" delete icon
6. Active tab has gold text and bottom border

- [ ] **Step 7: Commit**

```bash
git add -u
git add apps/web/lib/components/session-tab-bar.tsx
git commit -m "feat: replace session dropdown with tab bar in thought panel"
```
