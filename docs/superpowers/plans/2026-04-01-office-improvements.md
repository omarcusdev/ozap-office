# Ozap Office Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the frontend foundation (Zustand, TanStack Query, shadcn/ui, markdown pipeline) and deliver 4 features: session-based conversations, leader delegation visibility, and a functional meeting room with free multi-agent discussion.

**Architecture:** Replace the monolithic OfficeContext with focused Zustand stores and TanStack Query for data fetching. Install shadcn/ui with the existing dark theme. Build a proper markdown pipeline with remark-gfm. Then layer features: session-based chat, leader sub-threads, and a meeting engine with parallel agent execution + cross-reactions.

**Tech Stack:** React 19, Next.js 15, Zustand, TanStack Query, shadcn/ui, react-markdown + remark-gfm + rehype-highlight, Fastify 5, Drizzle ORM, PostgreSQL, AWS Bedrock (Claude via Converse API).

**Spec:** `docs/superpowers/specs/2026-04-01-office-improvements-design.md`

---

## Phase 1: Foundation Rebuild

### Task 1: Install frontend dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install Zustand, TanStack Query, and markdown dependencies**

```bash
cd apps/web && pnpm add zustand @tanstack/react-query remark-gfm rehype-highlight highlight.js
```

- [ ] **Step 2: Install shadcn/ui prerequisites**

shadcn/ui for Next.js 15 + Tailwind v4 requires `tailwind-merge`, `clsx`, and `lucide-react`:

```bash
cd apps/web && pnpm add tailwind-merge clsx lucide-react class-variance-authority
```

- [ ] **Step 3: Create the cn utility**

Create `apps/web/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
```

- [ ] **Step 4: Verify typecheck passes**

```bash
cd /Users/marcusgoncalves/projects/ozap-office && pnpm -F @ozap-office/web typecheck
```

Expected: success (no type errors — new deps are installed but not yet used).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/lib/utils.ts pnpm-lock.yaml
git commit -m "feat(web): install zustand, tanstack-query, shadcn prerequisites, and markdown plugins"
```

---

### Task 2: Set up shadcn/ui components and theme

**Files:**
- Create: `apps/web/lib/components/ui/button.tsx`
- Create: `apps/web/lib/components/ui/scroll-area.tsx`
- Create: `apps/web/lib/components/ui/collapsible.tsx`
- Create: `apps/web/lib/components/ui/dropdown-menu.tsx`
- Create: `apps/web/lib/components/ui/badge.tsx`
- Create: `apps/web/lib/components/ui/separator.tsx`
- Create: `apps/web/lib/components/ui/table.tsx`
- Create: `apps/web/lib/components/ui/textarea.tsx`
- Create: `apps/web/lib/components/ui/dialog.tsx`
- Create: `apps/web/lib/components/ui/tabs.tsx`

- [ ] **Step 1: Install shadcn/ui peer dependencies**

shadcn components require these Radix primitives:

```bash
cd apps/web && pnpm add @radix-ui/react-scroll-area @radix-ui/react-collapsible @radix-ui/react-dropdown-menu @radix-ui/react-separator @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-slot
```

- [ ] **Step 2: Create Button component**

Create `apps/web/lib/components/ui/button.tsx`:

```tsx
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { type ButtonHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-gold text-canvas hover:bg-gold-light",
        destructive: "bg-coral/15 text-coral border border-coral/30 hover:bg-coral/25",
        outline: "border border-edge bg-transparent text-cream hover:bg-raised",
        secondary: "bg-raised text-cream hover:bg-edge",
        ghost: "text-cream hover:bg-raised",
        link: "text-gold underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-7 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

- [ ] **Step 3: Create ScrollArea component**

Create `apps/web/lib/components/ui/scroll-area.tsx`:

```tsx
"use client"

import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import { forwardRef } from "react"
import { cn } from "@/lib/utils"

const ScrollArea = forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-edge" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
```

- [ ] **Step 4: Create Collapsible component**

Create `apps/web/lib/components/ui/collapsible.tsx`:

```tsx
"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

const Collapsible = CollapsiblePrimitive.Root
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
```

- [ ] **Step 5: Create DropdownMenu component**

Create `apps/web/lib/components/ui/dropdown-menu.tsx`:

```tsx
"use client"

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { forwardRef } from "react"
import { cn } from "@/lib/utils"

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuContent = forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-sm border border-edge bg-surface p-1 text-cream shadow-md",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-raised focus:text-cream data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuSeparator = forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-edge", className)} {...props} />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator }
```

- [ ] **Step 6: Create Badge component**

Create `apps/web/lib/components/ui/badge.tsx`:

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold font-mono tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-gold/15 text-gold",
        secondary: "border-transparent bg-raised text-sand",
        destructive: "border-transparent bg-coral/15 text-coral",
        outline: "border-edge text-sand",
        sage: "border-transparent bg-sage/15 text-sage",
        ember: "border-transparent bg-ember/15 text-ember",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>

const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
)

export { Badge, badgeVariants }
```

- [ ] **Step 7: Create Table component**

Create `apps/web/lib/components/ui/table.tsx`:

```tsx
import { forwardRef } from "react"
import { cn } from "@/lib/utils"

const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
)
Table.displayName = "Table"

const TableHeader = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b [&_tr]:border-edge", className)} {...props} />
  )
)
TableHeader.displayName = "TableHeader"

const TableBody = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  )
)
TableBody.displayName = "TableBody"

const TableRow = forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("border-b border-edge transition-colors hover:bg-raised/50", className)} {...props} />
  )
)
TableRow.displayName = "TableRow"

const TableHead = forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn("h-8 px-2 text-left align-middle font-mono text-[11px] font-medium text-sand [&:has([role=checkbox])]:pr-0", className)} {...props} />
  )
)
TableHead.displayName = "TableHead"

const TableCell = forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-2 py-1.5 align-middle text-[13px] [&:has([role=checkbox])]:pr-0", className)} {...props} />
  )
)
TableCell.displayName = "TableCell"

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
```

- [ ] **Step 8: Create Separator, Dialog, and Tabs components**

Create `apps/web/lib/components/ui/separator.tsx`:

```tsx
"use client"

import * as SeparatorPrimitive from "@radix-ui/react-separator"
import { forwardRef } from "react"
import { cn } from "@/lib/utils"

const Separator = forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn("shrink-0 bg-edge", orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]", className)}
    {...props}
  />
))
Separator.displayName = SeparatorPrimitive.Root.displayName

export { Separator }
```

Create `apps/web/lib/components/ui/dialog.tsx`:

```tsx
"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { forwardRef } from "react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const DialogOverlay = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-canvas/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-edge bg-surface p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-sm",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none">
        <X className="h-4 w-4 text-sand" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogTitle = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold text-cream", className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle }
```

Create `apps/web/lib/components/ui/tabs.tsx`:

```tsx
"use client"

import * as TabsPrimitive from "@radix-ui/react-tabs"
import { forwardRef } from "react"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex h-9 items-center justify-center rounded-sm bg-raised p-1 text-sand", className)}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface data-[state=active]:text-cream data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-2 focus-visible:outline-none", className)} {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

- [ ] **Step 9: Verify typecheck passes**

```bash
pnpm -F @ozap-office/web typecheck
```

Expected: success.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/components/ui/ apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add shadcn/ui components with ozap dark theme"
```

---

### Task 3: Create Zustand stores

**Files:**
- Create: `apps/web/lib/stores/agent-store.ts`
- Create: `apps/web/lib/stores/conversation-store.ts`
- Create: `apps/web/lib/stores/event-store.ts`
- Create: `apps/web/lib/stores/meeting-store.ts`
- Create: `apps/web/lib/stores/ws-store.ts`

- [ ] **Step 1: Create agent store**

Create `apps/web/lib/stores/agent-store.ts`:

```typescript
import { create } from "zustand"
import type { AgentStatus } from "@ozap-office/shared"

type AgentState = {
  id: string
  name: string
  role: string
  color: string
  positionX: number
  positionY: number
  status: AgentStatus
}

type AgentStore = {
  agents: AgentState[]
  loading: boolean
  selectedAgentId: string | null
  setAgents: (agents: AgentState[]) => void
  setLoading: (loading: boolean) => void
  selectAgent: (id: string | null) => void
  updateStatus: (agentId: string, status: AgentStatus) => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  loading: true,
  selectedAgentId: null,
  setAgents: (agents) => set({ agents, loading: false }),
  setLoading: (loading) => set({ loading }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  updateStatus: (agentId, status) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, status } : a
      ),
    })),
}))
```

- [ ] **Step 2: Create event store**

Create `apps/web/lib/stores/event-store.ts`:

```typescript
import { create } from "zustand"
import type { AgentEvent } from "@ozap-office/shared"

type EventStore = {
  events: AgentEvent[]
  activeTaskRunId: string | null
  setEvents: (events: AgentEvent[]) => void
  addEvent: (event: AgentEvent) => void
  setActiveTaskRunId: (id: string | null) => void
  clearEvents: () => void
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  activeTaskRunId: null,
  setEvents: (events) => set({ events }),
  addEvent: (event) => {
    const { activeTaskRunId } = get()
    if (activeTaskRunId && event.taskRunId !== activeTaskRunId) {
      set({ events: [event], activeTaskRunId: event.taskRunId })
      return true
    }
    if (!activeTaskRunId) {
      set({ activeTaskRunId: event.taskRunId })
    }
    set((state) => ({ events: [...state.events, event] }))
    return false
  },
  setActiveTaskRunId: (id) => set({ activeTaskRunId: id }),
  clearEvents: () => set({ events: [], activeTaskRunId: null }),
}))
```

- [ ] **Step 3: Create conversation store**

Create `apps/web/lib/stores/conversation-store.ts`:

```typescript
import { create } from "zustand"
import type { ConversationMessage } from "@ozap-office/shared"

export type ConversationSession = {
  id: string
  agentId: string
  title: string | null
  createdAt: Date
  updatedAt: Date
}

type ConversationStore = {
  sessions: ConversationSession[]
  activeSessionId: string | null
  messages: ConversationMessage[]
  setSessions: (sessions: ConversationSession[]) => void
  setActiveSessionId: (id: string | null) => void
  setMessages: (messages: ConversationMessage[]) => void
  addSession: (session: ConversationSession) => void
  removeSession: (id: string) => void
}

export const useConversationStore = create<ConversationStore>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  setSessions: (sessions) => set({ sessions }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setMessages: (messages) => set({ messages }),
  addSession: (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      messages: state.activeSessionId === id ? [] : state.messages,
    })),
}))
```

- [ ] **Step 4: Create meeting store**

Create `apps/web/lib/stores/meeting-store.ts`:

```typescript
import { create } from "zustand"
import type { MeetingMessage } from "@ozap-office/shared"

type MeetingStatus = "idle" | "starting" | "active" | "concluding" | "completed"

type MeetingStore = {
  meetingId: string | null
  status: MeetingStatus
  topic: string | null
  messages: MeetingMessage[]
  agentTyping: Record<string, boolean>
  setMeetingId: (id: string | null) => void
  setStatus: (status: MeetingStatus) => void
  setTopic: (topic: string | null) => void
  addMessage: (message: MeetingMessage) => void
  setMessages: (messages: MeetingMessage[]) => void
  setAgentTyping: (agentId: string, typing: boolean) => void
  reset: () => void
}

export const useMeetingStore = create<MeetingStore>((set) => ({
  meetingId: null,
  status: "idle",
  topic: null,
  messages: [],
  agentTyping: {},
  setMeetingId: (id) => set({ meetingId: id }),
  setStatus: (status) => set({ status }),
  setTopic: (topic) => set({ topic }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) => set({ messages }),
  setAgentTyping: (agentId, typing) =>
    set((state) => ({ agentTyping: { ...state.agentTyping, [agentId]: typing } })),
  reset: () =>
    set({ meetingId: null, status: "idle", topic: null, messages: [], agentTyping: {} }),
}))
```

- [ ] **Step 5: Create WebSocket store**

Create `apps/web/lib/stores/ws-store.ts`:

```typescript
import { create } from "zustand"

type WsStore = {
  connected: boolean
  setConnected: (connected: boolean) => void
}

export const useWsStore = create<WsStore>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}))
```

- [ ] **Step 6: Verify typecheck passes**

```bash
pnpm -F @ozap-office/web typecheck
```

Expected: success.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/stores/
git commit -m "feat(web): add zustand stores for agents, conversations, events, meetings, websocket"
```

---

### Task 4: Create TanStack Query hooks

**Files:**
- Create: `apps/web/lib/queries/agent-queries.ts`
- Create: `apps/web/lib/queries/conversation-queries.ts`
- Create: `apps/web/lib/queries/session-queries.ts`
- Create: `apps/web/lib/queries/meeting-queries.ts`

- [ ] **Step 1: Create agent queries**

Create `apps/web/lib/queries/agent-queries.ts`:

```typescript
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useAgentStore } from "@/lib/stores/agent-store"
import { useEffect } from "react"

export const useAgentsQuery = () => {
  const setAgents = useAgentStore((s) => s.setAgents)

  const query = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.getAgents(),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (query.data) {
      setAgents(query.data as any)
    }
  }, [query.data, setAgents])

  return query
}

export const useLatestRunQuery = (agentId: string | null) =>
  useQuery({
    queryKey: ["latest-run", agentId],
    queryFn: () => api.getLatestRun(agentId!),
    enabled: !!agentId,
  })

export const useTaskRunEventsQuery = (agentId: string | null, taskRunId: string | null) =>
  useQuery({
    queryKey: ["task-run-events", agentId, taskRunId],
    queryFn: () => api.getTaskRunEvents(agentId!, taskRunId!),
    enabled: !!agentId && !!taskRunId,
  })
```

- [ ] **Step 2: Create conversation queries**

Create `apps/web/lib/queries/conversation-queries.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useConversationStore } from "@/lib/stores/conversation-store"
import { useEffect } from "react"

export const useConversationQuery = (agentId: string | null, sessionId: string | null) => {
  const setMessages = useConversationStore((s) => s.setMessages)

  const query = useQuery({
    queryKey: ["conversation", agentId, sessionId],
    queryFn: () => {
      if (sessionId) {
        return api.getSessionMessages(agentId!, sessionId)
      }
      return api.getConversation(agentId!)
    },
    enabled: !!agentId,
  })

  useEffect(() => {
    if (query.data) {
      setMessages(query.data)
    }
  }, [query.data, setMessages])

  return query
}

export const useClearConversationMutation = (agentId: string | null) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.clearConversation(agentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation", agentId] })
      queryClient.invalidateQueries({ queryKey: ["sessions", agentId] })
    },
  })
}

export const useSendMessageMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ agentId, message }: { agentId: string; message: string }) =>
      api.triggerAgent(agentId, message),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ["conversation", agentId] })
      queryClient.invalidateQueries({ queryKey: ["sessions", agentId] })
    },
  })
}
```

- [ ] **Step 3: Create session queries**

Create `apps/web/lib/queries/session-queries.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useConversationStore } from "@/lib/stores/conversation-store"
import { useEffect } from "react"

export const useSessionsQuery = (agentId: string | null) => {
  const setSessions = useConversationStore((s) => s.setSessions)

  const query = useQuery({
    queryKey: ["sessions", agentId],
    queryFn: () => api.getSessions(agentId!),
    enabled: !!agentId,
  })

  useEffect(() => {
    if (query.data) {
      setSessions(query.data)
    }
  }, [query.data, setSessions])

  return query
}

export const useCreateSessionMutation = (agentId: string | null) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.createSession(agentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions", agentId] })
    },
  })
}

export const useDeleteSessionMutation = (agentId: string | null) => {
  const queryClient = useQueryClient()
  const removeSession = useConversationStore((s) => s.removeSession)

  return useMutation({
    mutationFn: (sessionId: string) => api.deleteSession(agentId!, sessionId),
    onSuccess: (_, sessionId) => {
      removeSession(sessionId)
      queryClient.invalidateQueries({ queryKey: ["sessions", agentId] })
    },
  })
}
```

- [ ] **Step 4: Create meeting queries**

Create `apps/web/lib/queries/meeting-queries.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"

export const useMeetingMessagesQuery = (meetingId: string | null) =>
  useQuery({
    queryKey: ["meeting-messages", meetingId],
    queryFn: () => api.getMeetingMessages(meetingId!),
    enabled: !!meetingId,
  })

export const useCreateMeetingMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (topic?: string) => api.createMeeting(topic),
    onSuccess: (meeting) => {
      queryClient.setQueryData(["meeting", meeting.id], meeting)
    },
  })
}

export const useSendMeetingMessageMutation = () =>
  useMutation({
    mutationFn: ({ meetingId, content }: { meetingId: string; content: string }) =>
      api.sendMeetingMessage(meetingId, content),
  })
```

- [ ] **Step 5: Verify typecheck passes**

```bash
pnpm -F @ozap-office/web typecheck
```

Expected: may fail because `api.getSessions`, `api.getSessionMessages`, `api.createSession`, `api.deleteSession` don't exist yet. That's fine — we'll add them in Task 6. Note any errors for now.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/queries/
git commit -m "feat(web): add tanstack query hooks for agents, conversations, sessions, meetings"
```

---

### Task 5: Build markdown renderer

**Files:**
- Create: `apps/web/lib/components/markdown-renderer.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Create markdown renderer component**

Create `apps/web/lib/components/markdown-renderer.tsx`:

```tsx
"use client"

import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/lib/components/ui/table"
import type { Components } from "react-markdown"

const components: Components = {
  table: ({ children }) => <Table>{children}</Table>,
  thead: ({ children }) => <TableHeader>{children}</TableHeader>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children }) => <TableHead>{children}</TableHead>,
  td: ({ children }) => <TableCell>{children}</TableCell>,
  pre: ({ children }) => (
    <pre className="bg-canvas border border-edge rounded-sm p-3 overflow-x-auto text-[12px] font-mono my-2">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code className="bg-raised border border-edge-light rounded px-1.5 py-0.5 text-[12px] font-mono text-gold" {...props}>
          {children}
        </code>
      )
    }
    return <code className={className} {...props}>{children}</code>
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-gold hover:text-gold-light underline underline-offset-2">
      {children}
    </a>
  ),
}

type MarkdownRendererProps = {
  content: string
}

export const MarkdownRenderer = ({ content }: MarkdownRendererProps) => (
  <div className="text-[13px] text-cream/90 leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-hr:my-2 prose-strong:text-cream prose-headings:text-cream">
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
      {content}
    </Markdown>
  </div>
)
```

- [ ] **Step 2: Add highlight.js dark theme to globals.css**

Add to the end of `apps/web/app/globals.css`:

```css
@import "highlight.js/styles/github-dark-dimmed.min.css";
```

Note: If the import doesn't work with Tailwind v4's CSS module system, we'll import it in the markdown renderer component directly.

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm -F @ozap-office/web typecheck
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/components/markdown-renderer.tsx apps/web/app/globals.css
git commit -m "feat(web): add markdown renderer with GFM tables, syntax highlighting, and custom components"
```

---

### Task 6: Refactor providers and wire new foundation

**Files:**
- Modify: `apps/web/app/providers.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/lib/components/thought-panel.tsx`
- Modify: `apps/web/lib/components/status-bar.tsx`
- Create: `apps/web/lib/hooks/use-agents-animation.ts`
- Modify: `apps/web/lib/api-client.ts`

This is the critical migration task — swap old Context for Zustand + TanStack Query while keeping the same UI behavior.

- [ ] **Step 1: Extend api-client with session endpoints**

Add to `apps/web/lib/api-client.ts` after the existing methods in the `api` object, before the closing `}`:

```typescript
  getSessions: (agentId: string) =>
    request<ConversationSession[]>(`/api/agents/${agentId}/sessions`),
  createSession: (agentId: string) =>
    request<ConversationSession>(`/api/agents/${agentId}/sessions`, { method: "POST" }),
  deleteSession: (agentId: string, sessionId: string) =>
    request<{ status: string }>(`/api/agents/${agentId}/sessions/${sessionId}`, { method: "DELETE" }),
  getSessionMessages: (agentId: string, sessionId: string) =>
    request<ConversationMessage[]>(`/api/agents/${agentId}/sessions/${sessionId}/messages`),
  completeMeeting: (meetingId: string) =>
    request<{ status: string }>(`/api/meetings/${meetingId}/complete`, { method: "POST" }),
```

Also add the import for `ConversationSession` at the top. Since this type doesn't exist in shared yet, define it locally:

```typescript
type ConversationSession = {
  id: string
  agentId: string
  title: string | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Extract animation hook from use-agents.ts**

Create `apps/web/lib/hooks/use-agents-animation.ts`. This file takes the animation RAF loop, waypoint pathfinding, and palette assignment from the current `use-agents.ts` — everything except the `agents` state and `updateAgentStatus`. 

Copy `apps/web/lib/use-agents.ts` entirely into the new file, then modify it to:
- Import `useAgentStore` to read `agents` instead of managing its own state
- Remove `useState<AgentState[]>` and the fetch `useEffect` — the store handles that
- Remove `updateAgentStatus` — the store handles that
- Remove `loading` state — the store handles that
- Keep: all animation refs, RAF loop, `callMeeting()`, `endMeeting()`, `getRenderPositions()`
- Export `useAgentsAnimation` instead of `useAgents`

The hook signature becomes:

```typescript
export const useAgentsAnimation = () => {
  const agents = useAgentStore((s) => s.agents)
  // ... all the ref-based animation logic unchanged ...
  return { inMeeting, callMeeting, endMeeting, getRenderPositions }
}
```

- [ ] **Step 3: Rewrite providers.tsx**

Replace `apps/web/app/providers.tsx` with:

```tsx
"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useRef, useEffect, type ReactNode } from "react"
import { createWsClient } from "@/lib/ws-client"
import { useAgentStore } from "@/lib/stores/agent-store"
import { useEventStore } from "@/lib/stores/event-store"
import { useMeetingStore } from "@/lib/stores/meeting-store"
import { useWsStore } from "@/lib/stores/ws-store"
import type { WsServerMessage } from "@ozap-office/shared"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const updateStatus = useAgentStore((s) => s.updateStatus)
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId)
  const addEvent = useEventStore((s) => s.addEvent)
  const addMeetingMessage = useMeetingStore((s) => s.addMessage)
  const setConnected = useWsStore((s) => s.setConnected)
  const selectedAgentIdRef = useRef(selectedAgentId)
  selectedAgentIdRef.current = selectedAgentId

  useEffect(() => {
    const handleMessage = (message: WsServerMessage) => {
      if (message.type === "agent_status") {
        updateStatus(message.payload.agentId, message.payload.status)
      } else if (message.type === "agent_event") {
        if (message.payload.agentId === selectedAgentIdRef.current) {
          addEvent(message.payload)
        }
      } else if (message.type === "meeting_message") {
        addMeetingMessage(message.payload)
      }
    }

    const client = createWsClient(handleMessage)
    setConnected(true)

    return () => {
      client.disconnect()
      setConnected(false)
    }
  }, [updateStatus, addEvent, addMeetingMessage, setConnected])

  return <>{children}</>
}

export const OfficeProvider = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <WebSocketProvider>{children}</WebSocketProvider>
  </QueryClientProvider>
)
```

- [ ] **Step 4: Update ThoughtPanel to use stores + MarkdownRenderer**

Modify `apps/web/lib/components/thought-panel.tsx`:

Replace the imports at the top (lines 1-7):

```tsx
"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useAgentStore } from "@/lib/stores/agent-store"
import { useEventStore } from "@/lib/stores/event-store"
import { useConversationStore } from "@/lib/stores/conversation-store"
import { useAgentsQuery } from "@/lib/queries/agent-queries"
import { useConversationQuery, useSendMessageMutation } from "@/lib/queries/conversation-queries"
import { useSessionsQuery } from "@/lib/queries/session-queries"
import { MarkdownRenderer } from "./markdown-renderer"
import { api } from "@/lib/api-client"
import type { AgentEvent } from "@ozap-office/shared"
```

Replace the `AgentBubble` component (lines 49-57) to use `MarkdownRenderer`:

```tsx
const AgentBubble = ({ content }: { content: string }) => (
  <div className="flex justify-start px-4 py-2">
    <div className="max-w-[90%] bg-raised border border-edge-light rounded-lg rounded-bl-sm px-3.5 py-2.5">
      <MarkdownRenderer content={content} />
    </div>
  </div>
)
```

Replace the first line of the `ThoughtPanel` component (line 121) and the destructured hook calls:

```tsx
export const ThoughtPanel = () => {
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId)
  const selectAgent = useAgentStore((s) => s.selectAgent)
  const agents = useAgentStore((s) => s.agents)
  const events = useEventStore((s) => s.events)
  const conversation = useConversationStore((s) => s.messages)

  useAgentsQuery()
  useConversationQuery(selectedAgentId, null)
  useSessionsQuery(selectedAgentId)
```

Remove the `clearConversation` from the destructuring and use the mutation instead. Where `clearConversation()` is called (line 248), replace with:

```tsx
const clearMutation = useClearConversationMutation(selectedAgentId)
// ... later in JSX:
onClick={() => clearMutation.mutate()}
```

Add the import for `useClearConversationMutation`:
```tsx
import { useConversationQuery, useSendMessageMutation, useClearConversationMutation } from "@/lib/queries/conversation-queries"
```

Update `handleSend` to use the `useSendMessageMutation`:

```tsx
const sendMutation = useSendMessageMutation()

const handleSend = async () => {
  const trimmed = message.trim()
  if (!trimmed || !selectedAgentId || sending) return

  setPendingMessage(trimmed)
  setMessage("")
  setSending(true)

  requestAnimationFrame(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  })

  try {
    await sendMutation.mutateAsync({ agentId: selectedAgentId, message: trimmed })
  } catch (err) {
    console.error("Failed to send:", err)
    setPendingMessage(null)
  }
  setSending(false)
}
```

- [ ] **Step 5: Update StatusBar to use store**

Replace `apps/web/lib/components/status-bar.tsx` — change import from `useOffice` to `useAgentStore`:

```tsx
"use client"

import { useAgentStore } from "@/lib/stores/agent-store"

const StatusDot = ({ count, label, color }: { count: number; label: string; color: string }) => (
  <div className="flex items-center gap-2">
    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
    <span className="font-mono text-[11px]">
      <span style={{ color }}>{count}</span>
      <span className="text-mute ml-1">{label}</span>
    </span>
  </div>
)

export const StatusBar = () => {
  const agents = useAgentStore((s) => s.agents)

  const counts = agents.reduce(
    (acc, a) => {
      if (a.status === "working" || a.status === "thinking") acc.working++
      else if (a.status === "waiting") acc.waiting++
      else if (a.status === "error") acc.error++
      else acc.idle++
      return acc
    },
    { working: 0, waiting: 0, error: 0, idle: 0 }
  )

  return (
    <div className="h-9 bg-surface border-t border-edge flex items-center px-5 gap-6">
      <StatusDot count={counts.working} label="active" color="var(--color-sage)" />
      <StatusDot count={counts.waiting} label="pending" color="var(--color-ember)" />
      <StatusDot count={counts.error} label="errors" color="var(--color-coral)" />
      <StatusDot count={counts.idle} label="idle" color="var(--color-mute)" />
    </div>
  )
}
```

- [ ] **Step 6: Update page.tsx to use new hooks**

Replace the `MeetingButton` in `apps/web/app/page.tsx` to use `useAgentsAnimation` directly instead of `useOffice`:

```tsx
"use client"

import { OfficeProvider } from "./providers"
import { OfficeCanvas } from "@/lib/components/office-canvas"
import { ThoughtPanel } from "@/lib/components/thought-panel"
import { StatusBar } from "@/lib/components/status-bar"
import { useMeetingStore } from "@/lib/stores/meeting-store"

const MeetingButton = () => {
  const meetingStatus = useMeetingStore((s) => s.status)
  const inMeeting = meetingStatus === "active" || meetingStatus === "starting"

  return (
    <button
      className={`px-4 py-1.5 text-[11px] font-semibold tracking-widest uppercase transition-all duration-200 rounded-sm ${
        inMeeting
          ? "bg-coral/15 text-coral border border-coral/30 hover:bg-coral/25"
          : "bg-gold/10 text-gold border border-gold/25 hover:bg-gold/20"
      }`}
    >
      {inMeeting ? "End Meeting" : "Call Meeting"}
    </button>
  )
}

const OfficeContent = () => (
  <div className="h-screen flex flex-col bg-canvas">
    <header className="h-14 bg-surface/90 border-b border-edge flex items-center px-5 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-gold rounded-sm flex items-center justify-center text-xs font-bold text-canvas">
          O
        </div>
        <h1 className="text-[15px] font-semibold tracking-tight">
          ozap<span className="text-mute">.</span>office
        </h1>
      </div>
      <div className="ml-auto">
        <MeetingButton />
      </div>
    </header>

    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <OfficeCanvas />
      </div>
      <ThoughtPanel />
    </div>

    <StatusBar />
  </div>
)

export default function OfficePage() {
  return (
    <OfficeProvider>
      <OfficeContent />
    </OfficeProvider>
  )
}
```

- [ ] **Step 7: Update OfficeCanvas to use stores**

The `OfficeCanvas` component currently imports `useOffice()`. Update it to use `useAgentStore` for `selectAgent`, `selectedAgentId`, `agents`, and `useAgentsAnimation` for `getRenderPositions`. The exact changes depend on what the canvas reads from context — import stores directly instead of the old context.

- [ ] **Step 8: Delete old hooks that are fully replaced**

Once everything compiles:
- Delete `apps/web/lib/use-conversation.ts` (replaced by `stores/conversation-store.ts` + `queries/conversation-queries.ts`)
- Delete `apps/web/lib/use-events.ts` (replaced by `stores/event-store.ts` + query hooks)
- Delete `apps/web/lib/use-agents.ts` (replaced by `stores/agent-store.ts` + `hooks/use-agents-animation.ts`)
- Keep `apps/web/lib/use-websocket.ts` — it may still be used for subscribe/unsubscribe logic

- [ ] **Step 9: Verify typecheck passes**

```bash
pnpm -F @ozap-office/web typecheck
```

Fix any type errors. This is the highest-risk step — expect iteration.

- [ ] **Step 10: Test locally**

```bash
pnpm dev:web
```

Open http://localhost:3000, verify:
- Office renders with agents
- Clicking an agent opens the thought panel
- Sending a message works
- Agent responses render with proper markdown tables (if the server is running)
- Status bar shows correct counts

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(web): migrate from OfficeContext to zustand stores + tanstack query + markdown renderer"
```

---

## Phase 2: Session-Based Conversations

### Task 7: Add conversation_sessions table and migration

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- New migration via `pnpm db:generate`

- [ ] **Step 1: Add conversation_sessions table to schema**

Add to `apps/server/src/db/schema.ts` before the `conversationMessages` table (before line 83):

```typescript
export const conversationSessions = pgTable(
  "conversation_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversation_sessions_agent_idx").on(table.agentId, table.updatedAt),
  ]
)
```

- [ ] **Step 2: Add sessionId to conversationMessages**

Add a nullable `sessionId` column to `conversationMessages`:

```typescript
sessionId: uuid("session_id").references(() => conversationSessions.id),
```

Add it after the `agentId` column (line 86).

- [ ] **Step 3: Generate and run migration**

```bash
cd /Users/marcusgoncalves/projects/ozap-office && pnpm db:generate
```

Review the generated migration file in `apps/server/drizzle/`. Verify it creates the new table and adds the column.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/
git commit -m "feat(server): add conversation_sessions table and sessionId column to messages"
```

---

### Task 8: Add session API endpoints

**Files:**
- Modify: `apps/server/src/routes/agents.ts`

- [ ] **Step 1: Add session routes**

Add to `apps/server/src/routes/agents.ts`, importing `conversationSessions` from schema and adding these routes inside `registerAgentRoutes`:

```typescript
import { agents, events, taskRuns, conversationMessages, conversationSessions } from "../db/schema.js"
```

Add routes after the existing `POST /api/agents/:id/read` route (after line 83):

```typescript
  server.get<{ Params: { id: string } }>("/api/agents/:id/sessions", async (request) => {
    return db
      .select()
      .from(conversationSessions)
      .where(eq(conversationSessions.agentId, request.params.id))
      .orderBy(desc(conversationSessions.updatedAt))
      .limit(50)
  })

  server.post<{ Params: { id: string } }>("/api/agents/:id/sessions", async (request) => {
    const [session] = await db
      .insert(conversationSessions)
      .values({ agentId: request.params.id })
      .returning()
    return session
  })

  server.delete<{ Params: { id: string; sessionId: string } }>(
    "/api/agents/:id/sessions/:sessionId",
    async (request) => {
      await db
        .delete(conversationMessages)
        .where(eq(conversationMessages.sessionId, request.params.sessionId))
      await db
        .delete(conversationSessions)
        .where(eq(conversationSessions.id, request.params.sessionId))
      return { status: "ok" }
    }
  )

  server.get<{ Params: { id: string; sessionId: string } }>(
    "/api/agents/:id/sessions/:sessionId/messages",
    async (request) => {
      return db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.sessionId, request.params.sessionId))
        .orderBy(conversationMessages.createdAt)
        .limit(100)
    }
  )
```

- [ ] **Step 2: Update saveConversationTurn in executor.ts to include sessionId**

Modify `apps/server/src/runtime/executor.ts`. The `saveConversationTurn` function (line 118) needs to accept and pass a sessionId. Update `executeAgent` to auto-create a session when a manual message comes in without one.

Add a helper to get or create the active session:

```typescript
const getOrCreateSession = async (agentId: string): Promise<string> => {
  const [existing] = await db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.agentId, agentId))
    .orderBy(desc(conversationSessions.updatedAt))
    .limit(1)

  if (existing) return existing.id

  const [session] = await db
    .insert(conversationSessions)
    .values({ agentId })
    .returning()
  return session.id
}
```

Update `saveConversationTurn` to accept `sessionId`:

```typescript
const saveConversationTurn = async (agentId: string, sessionId: string, userMessage: string, assistantResponse: string) => {
  await db.insert(conversationMessages).values([
    { agentId, sessionId, role: "user", content: userMessage },
    { agentId, sessionId, role: "assistant", content: assistantResponse },
  ])
  await db
    .update(conversationSessions)
    .set({ title: userMessage.slice(0, 50), updatedAt: new Date() })
    .where(and(eq(conversationSessions.id, sessionId), sql`title IS NULL`))
}
```

Update the call site in `executeAgent` (around line 194):

```typescript
if (!failed && inputContext && trigger !== "cron") {
  const [completedRun] = await db.select().from(taskRuns).where(eq(taskRuns.id, taskRun.id))
  const output = completedRun?.output as { result?: string } | null
  if (output?.result) {
    const sessionId = await getOrCreateSession(agentId)
    await saveConversationTurn(agentId, sessionId, inputContext, output.result)
  }
}
```

Add required imports: `conversationSessions` from schema and `sql` from drizzle-orm.

- [ ] **Step 3: Update loadConversationHistory to use sessions**

Update `loadConversationHistory` in executor.ts to load from the latest session:

```typescript
const loadConversationHistory = async (agentId: string): Promise<Message[]> => {
  const [latestSession] = await db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.agentId, agentId))
    .orderBy(desc(conversationSessions.updatedAt))
    .limit(1)

  const conditions = [eq(conversationMessages.agentId, agentId)]
  if (latestSession) {
    conditions.push(eq(conversationMessages.sessionId, latestSession.id))
  }

  const rows = await db
    .select()
    .from(conversationMessages)
    .where(and(...conditions))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(20)

  rows.reverse()

  const sanitized: typeof rows = []
  for (const msg of rows) {
    const last = sanitized[sanitized.length - 1]
    if (last && last.role === msg.role) continue
    sanitized.push(msg)
  }
  if (sanitized.length > 0 && sanitized[0].role !== "user") {
    sanitized.shift()
  }

  return sanitized.map((m) => ({
    role: m.role as "user" | "assistant",
    content: [{ text: m.content }],
  }))
}
```

- [ ] **Step 4: Verify server typecheck passes**

```bash
pnpm -F @ozap-office/server typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/
git commit -m "feat(server): add session API endpoints and session-aware conversation history"
```

---

### Task 9: Build session picker UI

**Files:**
- Create: `apps/web/lib/components/session-picker.tsx`
- Modify: `apps/web/lib/components/thought-panel.tsx`

- [ ] **Step 1: Create session picker component**

Create `apps/web/lib/components/session-picker.tsx`:

```tsx
"use client"

import { MessageSquarePlus, Trash2, ChevronDown } from "lucide-react"
import { useConversationStore, type ConversationSession } from "@/lib/stores/conversation-store"
import { useCreateSessionMutation, useDeleteSessionMutation } from "@/lib/queries/session-queries"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/lib/components/ui/dropdown-menu"

const formatRelativeDate = (date: Date) => {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

type SessionPickerProps = {
  agentId: string
}

export const SessionPicker = ({ agentId }: SessionPickerProps) => {
  const sessions = useConversationStore((s) => s.sessions)
  const activeSessionId = useConversationStore((s) => s.activeSessionId)
  const setActiveSessionId = useConversationStore((s) => s.setActiveSessionId)
  const createSession = useCreateSessionMutation(agentId)
  const deleteSession = useDeleteSessionMutation(agentId)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const handleNewSession = () => {
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
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-sand hover:text-cream transition-colors rounded-sm hover:bg-raised">
          <span className="truncate max-w-[180px]">
            {activeSession?.title ?? "Current conversation"}
          </span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px] max-h-[300px] overflow-y-auto">
          {sessions.map((session) => (
            <DropdownMenuItem
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className="flex items-center justify-between group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[12px] truncate">
                  {session.title ?? "Untitled conversation"}
                </div>
                <div className="text-[10px] text-mute">
                  {formatRelativeDate(session.createdAt)}
                </div>
              </div>
              {session.id === activeSessionId && (
                <div className="w-1.5 h-1.5 rounded-full bg-gold shrink-0 ml-2" />
              )}
              <button
                onClick={(e) => handleDeleteSession(e, session.id)}
                className="opacity-0 group-hover:opacity-100 ml-2 p-0.5 text-mute hover:text-coral transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </DropdownMenuItem>
          ))}
          {sessions.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={handleNewSession}>
            <MessageSquarePlus className="w-3.5 h-3.5 mr-2" />
            <span className="text-[12px]">New conversation</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
```

- [ ] **Step 2: Integrate session picker into ThoughtPanel header**

In `apps/web/lib/components/thought-panel.tsx`, add the `SessionPicker` to the header section, below the agent name/role area (around line 268, after the status dot):

```tsx
import { SessionPicker } from "./session-picker"
```

Add between the status dot div and the scroll area:

```tsx
{selectedAgentId && (
  <div className="px-5 pb-3">
    <SessionPicker agentId={selectedAgentId} />
  </div>
)}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm -F @ozap-office/web typecheck
```

- [ ] **Step 4: Test locally**

Verify: session picker dropdown works, new conversation button creates a session, switching sessions loads different messages.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/components/session-picker.tsx apps/web/lib/components/thought-panel.tsx
git commit -m "feat(web): add session picker for conversation history browsing"
```

---

## Phase 3: Leader Delegation Visibility

### Task 10: Add delegation event types to shared

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add delegation event types**

In `packages/shared/src/types.ts`, add `"delegation_start"` and `"delegation_response"` to `AgentEventType` (line 39):

```typescript
export type AgentEventType =
  | "user_message"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "message"
  | "approval_needed"
  | "completed"
  | "error"
  | "delegation_start"
  | "delegation_response"
```

- [ ] **Step 2: Build shared package**

```bash
pnpm -F @ozap-office/shared build
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add delegation_start and delegation_response event types"
```

---

### Task 11: Emit delegation events from leader tools

**Files:**
- Modify: `apps/server/src/tools/leader.ts`

- [ ] **Step 1: Update leader.ts to emit delegation events**

Replace the contents of `apps/server/src/tools/leader.ts`:

```typescript
import { nanoid } from "nanoid"
import { db } from "../db/client.js"
import { agents, taskRuns, events } from "../db/schema.js"
import { eq, desc, and } from "drizzle-orm"
import { executeAgentForMeeting } from "../runtime/executor.js"
import { eventBus } from "../events/event-bus.js"
import type { AgentEventType } from "@ozap-office/shared"

type ToolResult = { content: string; isError?: boolean }

type DelegationContext = {
  leaderAgentId: string
  leaderTaskRunId: string
}

let activeDelegationContext: DelegationContext | null = null

export const setDelegationContext = (ctx: DelegationContext | null) => {
  activeDelegationContext = ctx
}

const emitDelegationEvent = async (
  type: AgentEventType,
  content: string,
  metadata: Record<string, unknown>
) => {
  if (!activeDelegationContext) return
  const { leaderAgentId, leaderTaskRunId } = activeDelegationContext

  const [event] = await db
    .insert(events)
    .values({
      agentId: leaderAgentId,
      taskRunId: leaderTaskRunId,
      type,
      content,
      metadata,
      timestamp: new Date(),
    })
    .returning()

  eventBus.emit("agentEvent", event as any)
}

const askAgent = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const agentId = input.agentId as string
  const question = input.question as string

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent) return { content: `Agent ${agentId} not found`, isError: true }

  if (agent.status === "working" || agent.status === "thinking") {
    const history = await getAgentHistory({ agentId, limit: 1 })
    return { content: `Agent is busy. Recent history: ${history.content}` }
  }

  const delegationId = nanoid(10)

  await emitDelegationEvent("delegation_start", `Asking ${agent.name}: ${question}`, {
    delegationId,
    targetAgentId: agentId,
    targetAgentName: agent.name,
    question,
  })

  const response = await executeAgentForMeeting(agentId, question)

  await emitDelegationEvent("delegation_response", response, {
    delegationId,
    targetAgentId: agentId,
    targetAgentName: agent.name,
    response,
  })

  return { content: response }
}

const getAgentHistory = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const agentId = input.agentId as string
  const limit = (input.limit as number) ?? 5

  const recentRuns = await db
    .select()
    .from(taskRuns)
    .where(and(eq(taskRuns.agentId, agentId), eq(taskRuns.status, "completed")))
    .orderBy(desc(taskRuns.createdAt))
    .limit(limit)

  const recentEvents = await db
    .select()
    .from(events)
    .where(eq(events.agentId, agentId))
    .orderBy(desc(events.timestamp))
    .limit(20)

  return {
    content: JSON.stringify({
      recentRuns: recentRuns.map((r) => ({ id: r.id, trigger: r.trigger, output: r.output, completedAt: r.completedAt })),
      recentEvents: recentEvents.map((e) => ({ type: e.type, content: e.content, timestamp: e.timestamp })),
    }),
  }
}

const delegateTask = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const agentId = input.agentId as string
  const task = input.task as string

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent) return { content: `Agent ${agentId} not found`, isError: true }

  const delegationId = nanoid(10)

  await emitDelegationEvent("delegation_start", `Delegating to ${agent.name}: ${task}`, {
    delegationId,
    targetAgentId: agentId,
    targetAgentName: agent.name,
    task,
  })

  const { executeAgent } = await import("../runtime/executor.js")
  const taskRun = await executeAgent(agentId, "manual", task)

  const [completedRun] = await db.select().from(taskRuns).where(eq(taskRuns.id, taskRun.id))
  const output = completedRun?.output as { result?: string } | null

  await emitDelegationEvent("delegation_response", output?.result ?? "Task completed", {
    delegationId,
    targetAgentId: agentId,
    targetAgentName: agent.name,
    response: output?.result ?? "Task completed",
  })

  return { content: `Task delegated and completed. Response: ${output?.result ?? "Task completed"}` }
}

export const executeLeaderTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    askAgent,
    getAgentHistory,
    delegateTask,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown leader tool: ${toolName}`, isError: true }

  return handler(input)
}
```

- [ ] **Step 2: Set delegation context in executor.ts**

In `apps/server/src/runtime/executor.ts`, before the Leader's tool execution, set the delegation context. In the `executeTool` call inside `runAgenticLoop` (around line 242), wrap leader tool calls:

Add import at the top:
```typescript
import { setDelegationContext } from "../tools/leader.js"
```

In `executeAgent`, after creating the task run and before entering the loop, set the delegation context if it's the Leader:

```typescript
if (agent.name === "Leader") {
  setDelegationContext({ leaderAgentId: agentId, leaderTaskRunId: taskRun.id })
}
```

After the loop completes (after the `runAgenticLoop` call resolves), clear it:

```typescript
setDelegationContext(null)
```

- [ ] **Step 3: Verify server typecheck passes**

```bash
pnpm -F @ozap-office/server typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/tools/leader.ts apps/server/src/runtime/executor.ts
git commit -m "feat(server): emit delegation_start and delegation_response events from leader tools"
```

---

### Task 12: Build delegation thread UI component

**Files:**
- Create: `apps/web/lib/components/delegation-thread.tsx`
- Modify: `apps/web/lib/components/thought-panel.tsx`

- [ ] **Step 1: Create delegation thread component**

Create `apps/web/lib/components/delegation-thread.tsx`:

```tsx
"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { MarkdownRenderer } from "./markdown-renderer"
import { Badge } from "@/lib/components/ui/badge"
import { useAgentStore } from "@/lib/stores/agent-store"
import type { AgentEvent } from "@ozap-office/shared"

type DelegationPair = {
  start: AgentEvent
  response: AgentEvent | null
}

export const groupDelegationEvents = (events: AgentEvent[]): {
  delegations: DelegationPair[]
  otherEvents: AgentEvent[]
} => {
  const delegations: DelegationPair[] = []
  const otherEvents: AgentEvent[] = []
  const startEvents = new Map<string, AgentEvent>()

  for (const event of events) {
    if (event.type === "delegation_start") {
      const delegationId = (event.metadata as any).delegationId as string
      startEvents.set(delegationId, event)
    } else if (event.type === "delegation_response") {
      const delegationId = (event.metadata as any).delegationId as string
      const start = startEvents.get(delegationId)
      if (start) {
        delegations.push({ start, response: event })
        startEvents.delete(delegationId)
      }
    } else {
      otherEvents.push(event)
    }
  }

  for (const start of startEvents.values()) {
    delegations.push({ start, response: null })
  }

  return { delegations, otherEvents }
}

type DelegationThreadProps = {
  pair: DelegationPair
}

export const DelegationThread = ({ pair }: DelegationThreadProps) => {
  const [expanded, setExpanded] = useState(false)
  const agents = useAgentStore((s) => s.agents)

  const metadata = pair.start.metadata as {
    targetAgentId: string
    targetAgentName: string
    question?: string
    task?: string
  }

  const agent = agents.find((a) => a.id === metadata.targetAgentId)
  const agentColor = agent?.color ?? "#8a8478"
  const isPending = !pair.response

  return (
    <div className="px-4 py-1">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-2 text-[11px] font-mono text-sand hover:text-cream transition-colors w-full text-left"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: agentColor }} />
        <span>Asked {metadata.targetAgentName}</span>
        {isPending && <Badge variant="ember" className="ml-auto">waiting...</Badge>}
      </button>

      {expanded && (
        <div className="ml-5 mt-2 pl-3 space-y-2" style={{ borderLeft: `2px solid ${agentColor}` }}>
          <div className="text-[11px] text-mute">
            <span className="font-mono">→</span>{" "}
            <span className="text-cream/70">{metadata.question ?? metadata.task}</span>
          </div>
          {pair.response && (
            <div className="bg-raised/50 border border-edge-light rounded-sm p-2.5">
              <div className="text-[11px] font-mono text-sand mb-1">
                ← {metadata.targetAgentName} responded
              </div>
              <MarkdownRenderer content={pair.response.content} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Integrate delegation threads into ThoughtPanel**

In `apps/web/lib/components/thought-panel.tsx`, import and use the delegation components:

```tsx
import { DelegationThread, groupDelegationEvents } from "./delegation-thread"
```

Where `internalEvents` is computed (around line 212), update to separate delegation events:

```tsx
const { delegations, otherEvents: nonDelegationEvents } = groupDelegationEvents(events)
const internalEvents = nonDelegationEvents.filter(
  (e) => e.type === "thinking" || e.type === "tool_call" || e.type === "tool_result"
)
const responseEvents = nonDelegationEvents.filter((e) => e.type === "message")
```

In the JSX, render delegation threads between the internal events and the response. After the `InternalDetails` rendering and before `currentResponse`:

```tsx
{delegations.map((pair) => (
  <DelegationThread key={pair.start.id} pair={pair} />
))}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm -F @ozap-office/web typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/components/delegation-thread.tsx apps/web/lib/components/thought-panel.tsx
git commit -m "feat(web): add delegation thread component showing leader-agent sub-conversations"
```

---

## Phase 4: Functional Meeting Room

### Task 13: Build meeting engine on the server

**Files:**
- Create: `apps/server/src/runtime/meeting-engine.ts`
- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/src/routes/meetings.ts`

- [ ] **Step 1: Update meetingMessages schema**

Add `agentId` and `round` columns to `meetingMessages` in `apps/server/src/db/schema.ts`:

```typescript
export const meetingMessages = pgTable("meeting_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id),
  sender: text("sender").notNull(),
  agentId: uuid("agent_id").references(() => agents.id),
  content: text("content").notNull(),
  round: integer("round").default(1),
  metadata: jsonb("metadata").default(sql`'{}'`),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
})
```

Generate migration:

```bash
pnpm db:generate
```

- [ ] **Step 2: Create meeting engine**

Create `apps/server/src/runtime/meeting-engine.ts`:

```typescript
import { nanoid } from "nanoid"
import { db } from "../db/client.js"
import { agents, meetings, meetingMessages } from "../db/schema.js"
import { eq, ne } from "drizzle-orm"
import { executeAgentForMeeting } from "./executor.js"
import { eventBus } from "../events/event-bus.js"
import type { MeetingMessage } from "@ozap-office/shared"

const MAX_REACTION_ROUNDS = 2

const broadcastMeetingMessage = (message: MeetingMessage) => {
  eventBus.emit("meetingMessage", message)
}

const saveMeetingMessage = async (
  meetingId: string,
  sender: string,
  agentId: string | null,
  content: string,
  round: number,
  phase: string
): Promise<MeetingMessage> => {
  const [msg] = await db
    .insert(meetingMessages)
    .values({
      meetingId,
      sender,
      agentId,
      content,
      round,
      metadata: { phase },
      timestamp: new Date(),
    })
    .returning()

  const meetingMsg: MeetingMessage = {
    id: msg.id,
    meetingId: msg.meetingId,
    sender: msg.sender,
    content: msg.content,
    metadata: { phase, round, agentId },
    timestamp: msg.timestamp,
  }

  broadcastMeetingMessage(meetingMsg)
  return meetingMsg
}

const buildTranscript = (messages: MeetingMessage[], agentNames: Record<string, string>): string => {
  return messages
    .map((m) => {
      const name = m.sender === "user" ? "User" : (agentNames[m.sender] ?? m.sender)
      return `${name}: ${m.content}`
    })
    .join("\n\n")
}

export const processMeetingMessage = async (
  meetingId: string,
  userMessage: string
): Promise<void> => {
  const allAgents = await db.select().from(agents).where(ne(agents.status, "error"))
  const agentNames: Record<string, string> = {}
  for (const agent of allAgents) {
    agentNames[agent.id] = agent.name
  }

  await saveMeetingMessage(meetingId, "user", null, userMessage, 0, "user")

  const conversationMessages = await db
    .select()
    .from(meetingMessages)
    .where(eq(meetingMessages.meetingId, meetingId))
    .orderBy(meetingMessages.timestamp)

  const existingMessages: MeetingMessage[] = conversationMessages.map((m) => ({
    id: m.id,
    meetingId: m.meetingId,
    sender: m.sender,
    content: m.content,
    metadata: (m.metadata as Record<string, unknown>) ?? {},
    timestamp: m.timestamp,
  }))

  const transcript = buildTranscript(existingMessages, agentNames)
  const roundMessages: MeetingMessage[] = []

  const initialPromises = allAgents.map(async (agent) => {
    const prompt = `You are in a team meeting with other agents. Here is the conversation so far:\n\n${transcript}\n\nThe user just said: "${userMessage}"\n\nRespond from your area of expertise (${agent.role}). Be concise and relevant. If you have nothing to add for this topic, say "PASS".`

    const response = await executeAgentForMeeting(agent.id, prompt)

    if (response.trim().toUpperCase() === "PASS") return null

    const msg = await saveMeetingMessage(meetingId, agent.id, agent.id, response, 1, "response")
    return msg
  })

  const initialResults = await Promise.all(initialPromises)
  const initialResponses = initialResults.filter((r): r is MeetingMessage => r !== null)
  roundMessages.push(...initialResponses)

  for (let round = 2; round <= MAX_REACTION_ROUNDS + 1; round++) {
    if (roundMessages.length === 0) break

    const fullTranscript = buildTranscript([...existingMessages, ...roundMessages], agentNames)

    const reactionPromises = allAgents.map(async (agent) => {
      const alreadyResponded = roundMessages.some(
        (m) => m.sender === agent.id && (m.metadata as any).round === round - 1
      )
      if (!alreadyResponded && round > 2) return null

      const prompt = `Team meeting transcript:\n\n${fullTranscript}\n\nGiven the responses above, do you have something to add, disagree with, or build upon? If not, respond with exactly "PASS". Be concise.`

      const response = await executeAgentForMeeting(agent.id, prompt)

      if (response.trim().toUpperCase() === "PASS") return null

      const msg = await saveMeetingMessage(meetingId, agent.id, agent.id, response, round, "reaction")
      return msg
    })

    const reactionResults = await Promise.all(reactionPromises)
    const reactions = reactionResults.filter((r): r is MeetingMessage => r !== null)

    if (reactions.length === 0) break
    roundMessages.push(...reactions)
  }
}

export const completeMeeting = async (meetingId: string) => {
  await db
    .update(meetings)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(meetings.id, meetingId))
}
```

- [ ] **Step 3: Update meeting routes**

Replace `apps/server/src/routes/meetings.ts`:

```typescript
import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { meetings, meetingMessages } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { processMeetingMessage, completeMeeting } from "../runtime/meeting-engine.js"

export const registerMeetingRoutes = (server: FastifyInstance) => {
  server.post<{ Body: { topic?: string } }>("/api/meetings", async (request) => {
    const [meeting] = await db
      .insert(meetings)
      .values({
        topic: request.body.topic ?? null,
        status: "active",
        startedAt: new Date(),
      })
      .returning()

    return meeting
  })

  server.get<{ Params: { id: string } }>("/api/meetings/:id/messages", async (request) => {
    return db
      .select()
      .from(meetingMessages)
      .where(eq(meetingMessages.meetingId, request.params.id))
      .orderBy(meetingMessages.timestamp)
  })

  server.post<{
    Params: { id: string }
    Body: { content: string }
  }>("/api/meetings/:id/messages", async (request) => {
    const { id } = request.params
    const { content } = request.body

    processMeetingMessage(id, content).catch((err) => {
      console.error("Meeting message processing failed:", err)
    })

    return { status: "processing" }
  })

  server.post<{ Params: { id: string } }>("/api/meetings/:id/complete", async (request) => {
    await completeMeeting(request.params.id)
    return { status: "ok" }
  })
}
```

- [ ] **Step 4: Verify server typecheck passes**

```bash
pnpm -F @ozap-office/server typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/runtime/meeting-engine.ts apps/server/src/routes/meetings.ts apps/server/src/db/schema.ts apps/server/drizzle/
git commit -m "feat(server): add multi-agent meeting engine with parallel responses and cross-reactions"
```

---

### Task 14: Build meeting panel UI

**Files:**
- Create: `apps/web/lib/components/meeting-panel.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Create meeting panel component**

Create `apps/web/lib/components/meeting-panel.tsx`:

```tsx
"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, X } from "lucide-react"
import { useMeetingStore } from "@/lib/stores/meeting-store"
import { useAgentStore } from "@/lib/stores/agent-store"
import { MarkdownRenderer } from "./markdown-renderer"
import { Badge } from "@/lib/components/ui/badge"
import { Button } from "@/lib/components/ui/button"
import { api } from "@/lib/api-client"

const formatTime = (timestamp: Date) =>
  new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

export const MeetingPanel = () => {
  const meetingId = useMeetingStore((s) => s.meetingId)
  const status = useMeetingStore((s) => s.status)
  const messages = useMeetingStore((s) => s.messages)
  const topic = useMeetingStore((s) => s.topic)
  const agents = useAgentStore((s) => s.agents)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  const agentMap = new Map(agents.map((a) => [a.id, a]))

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const handleSend = useCallback(async () => {
    const trimmed = message.trim()
    if (!trimmed || !meetingId || sending) return

    setMessage("")
    setSending(true)

    try {
      await api.sendMeetingMessage(meetingId, trimmed)
    } catch (err) {
      console.error("Failed to send meeting message:", err)
    }
    setSending(false)
  }, [message, meetingId, sending])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (status !== "active") return null

  const currentRound = messages.length > 0
    ? Math.max(...messages.map((m) => ((m.metadata as any)?.round as number) ?? 0))
    : 0

  let lastRound = 0

  return (
    <div className="w-[450px] min-w-[450px] bg-surface border-l border-edge flex flex-col h-full">
      <div className="p-5 border-b border-edge">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-[15px] text-cream leading-tight">Team Meeting</h3>
            {topic && <p className="text-xs text-sand mt-0.5">{topic}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              {agents.slice(0, 5).map((agent) => (
                <div
                  key={agent.id}
                  className="w-5 h-5 rounded-full border-2 border-surface flex items-center justify-center text-[8px] font-bold text-canvas"
                  style={{ backgroundColor: agent.color }}
                  title={agent.name}
                >
                  {agent.name[0]}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <p className="text-sm text-mute">Meeting started</p>
            <p className="text-xs text-mute/60 mt-1">Send a message to all agents</p>
          </div>
        ) : (
          <div className="py-3 space-y-1">
            {messages.map((msg) => {
              const round = ((msg.metadata as any)?.round as number) ?? 0
              const phase = ((msg.metadata as any)?.phase as string) ?? "user"
              const showRoundSeparator = round > lastRound && round > 0
              lastRound = round

              const isUser = msg.sender === "user"
              const agent = !isUser ? agentMap.get(msg.sender) : null

              return (
                <div key={msg.id}>
                  {showRoundSeparator && (
                    <div className="flex items-center gap-3 px-4 py-2">
                      <div className="flex-1 h-px bg-edge" />
                      <span className="text-[10px] font-mono text-mute uppercase tracking-wider">
                        {phase === "reaction" ? `Discussion (round ${round})` : "Initial Responses"}
                      </span>
                      <div className="flex-1 h-px bg-edge" />
                    </div>
                  )}

                  {isUser ? (
                    <div className="flex justify-end px-4 py-2">
                      <div className="max-w-[85%] bg-gold/15 border border-gold/20 rounded-lg rounded-br-sm px-3.5 py-2.5">
                        <p className="text-sm text-cream leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-start px-4 py-2">
                      <div className="max-w-[90%]">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-canvas"
                            style={{ backgroundColor: agent?.color ?? "#8a8478" }}
                          >
                            {agent?.name[0] ?? "?"}
                          </div>
                          <span className="text-[11px] font-medium text-sand">{agent?.name ?? msg.sender}</span>
                          <span className="text-[10px] font-mono text-mute">{formatTime(msg.timestamp)}</span>
                        </div>
                        <div className="bg-raised border border-edge-light rounded-lg rounded-tl-sm px-3.5 py-2.5">
                          <MarkdownRenderer content={msg.content} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-edge">
        <div className="flex items-center gap-2 bg-raised border border-edge-light rounded-sm overflow-hidden transition-colors focus-within:border-gold/30">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message all agents..."
            disabled={sending}
            className="flex-1 bg-transparent px-3.5 py-2.5 text-sm text-cream placeholder-mute focus:outline-none disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="px-3.5 py-2.5 text-gold hover:text-gold-light disabled:text-mute disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire meeting button to create/complete meetings and show panel**

Update `apps/web/app/page.tsx` to wire the meeting button to the API and show the meeting panel:

```tsx
"use client"

import { OfficeProvider } from "./providers"
import { OfficeCanvas } from "@/lib/components/office-canvas"
import { ThoughtPanel } from "@/lib/components/thought-panel"
import { MeetingPanel } from "@/lib/components/meeting-panel"
import { StatusBar } from "@/lib/components/status-bar"
import { useMeetingStore } from "@/lib/stores/meeting-store"
import { useAgentStore } from "@/lib/stores/agent-store"
import { api } from "@/lib/api-client"

const MeetingButton = () => {
  const meetingStatus = useMeetingStore((s) => s.status)
  const setMeetingId = useMeetingStore((s) => s.setMeetingId)
  const setStatus = useMeetingStore((s) => s.setStatus)
  const reset = useMeetingStore((s) => s.reset)
  const meetingId = useMeetingStore((s) => s.meetingId)
  const selectAgent = useAgentStore((s) => s.selectAgent)
  const inMeeting = meetingStatus === "active" || meetingStatus === "starting"

  const handleCallMeeting = async () => {
    setStatus("starting")
    selectAgent(null)
    try {
      const meeting = await api.createMeeting("Team sync")
      setMeetingId(meeting.id)
      setStatus("active")
    } catch (err) {
      console.error("Failed to create meeting:", err)
      setStatus("idle")
    }
  }

  const handleEndMeeting = async () => {
    setStatus("concluding")
    if (meetingId) {
      await api.completeMeeting(meetingId).catch(console.error)
    }
    reset()
  }

  return (
    <button
      onClick={inMeeting ? handleEndMeeting : handleCallMeeting}
      className={`px-4 py-1.5 text-[11px] font-semibold tracking-widest uppercase transition-all duration-200 rounded-sm ${
        inMeeting
          ? "bg-coral/15 text-coral border border-coral/30 hover:bg-coral/25"
          : "bg-gold/10 text-gold border border-gold/25 hover:bg-gold/20"
      }`}
    >
      {inMeeting ? "End Meeting" : "Call Meeting"}
    </button>
  )
}

const OfficeContent = () => {
  const meetingStatus = useMeetingStore((s) => s.status)
  const showMeeting = meetingStatus === "active"

  return (
    <div className="h-screen flex flex-col bg-canvas">
      <header className="h-14 bg-surface/90 border-b border-edge flex items-center px-5 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gold rounded-sm flex items-center justify-center text-xs font-bold text-canvas">
            O
          </div>
          <h1 className="text-[15px] font-semibold tracking-tight">
            ozap<span className="text-mute">.</span>office
          </h1>
        </div>
        <div className="ml-auto">
          <MeetingButton />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex items-center justify-center bg-canvas">
          <OfficeCanvas />
        </div>
        {showMeeting ? <MeetingPanel /> : <ThoughtPanel />}
      </div>

      <StatusBar />
    </div>
  )
}

export default function OfficePage() {
  return (
    <OfficeProvider>
      <OfficeContent />
    </OfficeProvider>
  )
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm -F @ozap-office/web typecheck
```

- [ ] **Step 4: Test locally**

Start both server and web:
```bash
pnpm dev:server &
pnpm dev:web
```

Test the full flow:
1. Click "Call Meeting" → meeting panel opens
2. Type a message → agents respond in parallel
3. Responses stream in via WebSocket
4. Cross-reactions appear if agents have something to add
5. Click "End Meeting" → panel closes, meeting archived

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/components/meeting-panel.tsx apps/web/app/page.tsx
git commit -m "feat(web): add meeting panel with multi-agent group chat UI"
```

---

### Task 15: Update shared MeetingMessage type

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add agentId and round to MeetingMessage**

Update the `MeetingMessage` type in `packages/shared/src/types.ts` (line 82):

```typescript
export type MeetingMessage = {
  id: string
  meetingId: string
  sender: string
  agentId?: string | null
  content: string
  round?: number
  metadata: Record<string, unknown>
  timestamp: Date
}
```

- [ ] **Step 2: Build shared**

```bash
pnpm -F @ozap-office/shared build
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add agentId and round fields to MeetingMessage type"
```

---

### Task 16: Final integration test and cleanup

**Files:**
- Various — fix any remaining issues

- [ ] **Step 1: Run full typecheck across all packages**

```bash
pnpm -F @ozap-office/shared build && pnpm -F @ozap-office/server typecheck && pnpm -F @ozap-office/web typecheck
```

Fix any errors.

- [ ] **Step 2: Run full build**

```bash
pnpm build
```

Fix any build errors.

- [ ] **Step 3: Clean up unused files**

Remove old hooks if not already deleted:
- `apps/web/lib/use-conversation.ts`
- `apps/web/lib/use-events.ts`
- `apps/web/lib/use-agents.ts` (only if fully replaced by `hooks/use-agents-animation.ts`)

Remove unused exports from `providers.tsx` (the old `useOffice` export).

- [ ] **Step 4: Verify the app runs end-to-end locally**

```bash
pnpm dev:server &
pnpm dev:web
```

Test checklist:
- [ ] Office canvas renders agents
- [ ] Click agent → thought panel opens
- [ ] Send message → agent responds with properly rendered markdown tables
- [ ] Session picker dropdown shows conversation history
- [ ] "New Conversation" creates a fresh session
- [ ] Switch to old session loads previous messages
- [ ] Talk to Leader → see delegation sub-threads (collapsible)
- [ ] Click "Call Meeting" → meeting panel opens
- [ ] Send meeting message → multiple agents respond
- [ ] Agents react to each other in discussion rounds
- [ ] "End Meeting" closes and archives

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: cleanup old hooks and fix integration issues"
```
