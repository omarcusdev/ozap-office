# Conversation Tab Bar Redesign

## Problem

The current conversation management uses a dropdown menu (`SessionPicker`) inside the panel header. The "New conversation" button is at the bottom of the dropdown's scrollable list — requiring users to open the dropdown, scroll past all sessions, then click. This makes the most common action (starting a new conversation) the hardest to reach.

## Solution

Replace the `SessionPicker` dropdown with a horizontal **tab bar** between the agent header and the message area. A "+" button is pinned to the left of the bar, always visible and in a predictable position.

## Layout

```
Panel (400px)
├── Header (agent avatar, name, role, status, close button)
├── Session Tab Bar                          ← replaces SessionPicker
│   ├── [+] button (pinned left, border-right separator)
│   ├── Tab: active session (gold text, 2px gold bottom border)
│   ├── Tab: inactive session (muted text, × on hover)
│   └── ...more tabs (overflow-x: auto, scrollbar hidden)
├── Message Area (flex-1, scrollable)
└── Input Area
```

## Component: SessionTabBar

Replaces `session-picker.tsx` with a new `session-tab-bar.tsx` component.

### Props

```ts
type SessionTabBarProps = {
  agentId: string
}
```

### Behavior

- **"+" button**: Pinned to the left of the bar, separated by a `border-right`. Calls `createSession.mutate()` and auto-selects the new session on success. Disabled while `createSession.isPending`.
- **Active tab**: Gold text (`text-gold`), 2px gold bottom border, slightly lighter background (`bg-surface`).
- **Inactive tab**: Muted text (`text-sand`), no bottom border, background inherits from bar (`bg-[#1e1c19]` or similar dark tone).
- **Delete**: Each inactive tab shows a small "×" icon on hover (right side of the tab). Clicking it calls `deleteSession.mutate(sessionId)`. Active tab does not show "×" (prevent accidental deletion of current conversation).
- **Tab text**: Displays `session.title ?? "Untitled"`, truncated with `text-ellipsis` and `max-w-[120px]`.
- **Overflow**: Tab bar uses `overflow-x-auto` with scrollbar hidden via CSS (`scrollbar-width: none` / `::-webkit-scrollbar { display: none }`). Handles the rare 4+ sessions case gracefully.
- **Tab bar background**: Darker than the panel surface (e.g., `#1e1c19`) to visually separate it from the header and message area.

### Visual Specs

- Tab bar height: ~36px
- "+" button padding: `px-3 py-2`
- Tab padding: `px-3.5 py-2`
- Font: `font-mono text-[11px]`
- Active indicator: `border-b-2 border-gold`
- Delete icon: 10x10px, `text-mute hover:text-coral`, `opacity-0 group-hover:opacity-100`

## Files Changed

| File | Change |
|------|--------|
| `apps/web/lib/components/session-tab-bar.tsx` | New component replacing SessionPicker |
| `apps/web/lib/components/session-picker.tsx` | Deleted |
| `apps/web/lib/components/thought-panel.tsx` | Replace `<SessionPicker>` with `<SessionTabBar>`, move it from inside the header `<div>` to between header and message area |

## Store / Query Changes

None. The component uses the same Zustand store selectors (`sessions`, `activeSessionId`, `setActiveSessionId`) and the same TanStack Query mutations (`useCreateSessionMutation`, `useDeleteSessionMutation`).

## What Gets Removed

- `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` imports (no longer needed by this component)
- `ChevronDown` icon import
- The `formatRelativeDate` helper (tabs are too compact for dates — title is enough)

## Edge Cases

- **Zero sessions**: Tab bar shows only the "+" button. First click creates a session and selects it.
- **Session deleted while active**: Same behavior as current — store's `removeSession` clears `activeSessionId` if it matches, query invalidation triggers reload.
- **Long session titles**: Truncated at ~120px with ellipsis.
