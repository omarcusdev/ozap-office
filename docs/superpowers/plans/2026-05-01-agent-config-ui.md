# Agent Config UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-agent UI for editing inference config (extended thinking, model, maxTokens, temperature) without redeploying.

**Architecture:** New nullable `inference_config` JSONB column on `agents` table. `bedrock.ts` `converse()` accepts an optional `inferenceConfig` override that layers on top of global defaults. `executor.ts` passes the agent's config through to every Bedrock call. New `PATCH /api/agents/:id` route with range validation. Frontend gets a gear button in `thought-panel`'s header that opens an `AgentConfigPanel` slide-in (same pattern as `approvals-panel.tsx`). `seed.ts` is NOT modified — `inferenceConfig` stays UI-managed only; everything else continues to be code-managed.

**Tech Stack:** TypeScript ESM (Node 20) + Drizzle/Postgres + AWS Bedrock Converse on the server, Next.js 15 + React 19 + Tailwind v4 + TanStack Query + Zustand on the web.

**Reference:** `docs/superpowers/specs/2026-05-01-agent-config-ui-design.md`

**No automated tests** (project has no framework — confirmed earlier). Each task ends with typecheck + commit. Manual production validation steps are listed at the end.

---

### Task 1: Add `InferenceConfig` to shared types

**Files:**
- Modify: `packages/shared/src/types.ts:3-16` (extend `AgentConfig`)
- Modify: `packages/shared/src/types.ts` (add new `InferenceConfig` type near the top)

- [ ] **Step 1: Add `InferenceConfig` type and extend `AgentConfig`**

Open `packages/shared/src/types.ts`. Right after `export type AgentStatus = ...` (line 1) and before `export type AgentConfig = ...` (line 3), insert:

```ts
export type InferenceConfig = {
  thinking?: { enabled: boolean; budgetTokens: number }
  model?: "claude-sonnet-4-6" | "claude-haiku-4-5" | "claude-opus-4-7"
  maxTokens?: number
  temperature?: number
}
```

Then in the `AgentConfig` type (lines 3-16), add `inferenceConfig: InferenceConfig | null` as the last field before the closing brace, after `updatedAt`:

```ts
export type AgentConfig = {
  id: string
  name: string
  role: string
  systemPrompt: string
  tools: ToolDefinition[]
  schedule: string | null
  cronPrompt: string | null
  color: string
  position: { x: number; y: number }
  status: AgentStatus
  createdAt: Date
  updatedAt: Date
  inferenceConfig: InferenceConfig | null
}
```

- [ ] **Step 2: Build the shared package**

Run: `pnpm -F @ozap-office/shared build`
Expected: no errors, `packages/shared/dist/` updated.

- [ ] **Step 3: Type-check both apps**

Run: `pnpm -F @ozap-office/server typecheck && pnpm -F @ozap-office/web typecheck`
Expected: errors complaining about `inferenceConfig` missing on `agent` objects in places that destructure or construct an `AgentConfig`. Note these for Task 6.

If errors show up only in `apps/server/src/routes/agents.ts` (mapping DB rows to `AgentConfig`), that's expected and fine — we'll either map the new column there in Task 7 or do a structural cast. If errors appear elsewhere, STOP and report.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "types: add InferenceConfig and AgentConfig.inferenceConfig"
```

(Skip committing `packages/shared/dist/` — project gitignores it; deploy rebuilds.)

---

### Task 2: Add `inferenceConfig` column to `agents` schema

**Files:**
- Modify: `apps/server/src/db/schema.ts:4-18` (extend `agents` table)

- [ ] **Step 1: Add the column**

In `apps/server/src/db/schema.ts`, find the `agents` table definition (line 4). Add `inferenceConfig: jsonb("inference_config"),` as a new field, placed just before `createdAt`:

```ts
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  tools: jsonb("tools").notNull().default(sql`'[]'`),
  schedule: text("schedule"),
  cronPrompt: text("cron_prompt"),
  color: text("color").notNull(),
  positionX: integer("position_x").notNull(),
  positionY: integer("position_y").notNull(),
  status: text("status").notNull().default("idle"),
  inferenceConfig: jsonb("inference_config"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors. (Drizzle infers the column type as `unknown` for jsonb without a generic, which is fine — we cast in consumers.)

(DO NOT commit yet — Task 3 generates the migration as part of the same change.)

---

### Task 3: Generate and apply Drizzle migration

**Files:**
- Create: `apps/server/drizzle/0008_<random>.sql` (Drizzle picks the name)

- [ ] **Step 1: Generate migration**

Run: `pnpm -F @ozap-office/server db:generate`
Expected: a new SQL file appears in `apps/server/drizzle/`. Note its name.

- [ ] **Step 2: Inspect generated SQL**

Read the new file. Verify it contains exactly:

```sql
ALTER TABLE "agents" ADD COLUMN "inference_config" jsonb;
```

(plus the standard Drizzle journal updates).

If Drizzle generated extra ALTER TABLE statements (e.g., for unrelated column reordering), STOP and report.

- [ ] **Step 3: Commit schema + migration together**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/
git commit -m "feat(db): add inference_config column to agents"
```

---

### Task 4: Validation helper

**Files:**
- Create: `apps/server/src/runtime/validate-inference-config.ts`

- [ ] **Step 1: Create the validator**

Create `apps/server/src/runtime/validate-inference-config.ts` with:

```ts
import type { InferenceConfig } from "@ozap-office/shared"

const VALID_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-opus-4-7",
])

type Validation = { valid: true } | { valid: false; message: string }

export const validateInferenceConfig = (
  config: InferenceConfig | null
): Validation => {
  if (config === null) return { valid: true }

  if (config.model && !VALID_MODELS.has(config.model)) {
    return { valid: false, message: `Invalid model: ${config.model}` }
  }

  if (config.thinking?.enabled) {
    const b = config.thinking.budgetTokens
    if (typeof b !== "number" || b < 1024 || b > 16384) {
      return { valid: false, message: "thinking.budgetTokens must be 1024-16384" }
    }
  }

  if (config.maxTokens !== undefined) {
    if (
      typeof config.maxTokens !== "number" ||
      config.maxTokens < 256 ||
      config.maxTokens > 8192
    ) {
      return { valid: false, message: "maxTokens must be 256-8192" }
    }
  }

  if (config.temperature !== undefined) {
    if (
      typeof config.temperature !== "number" ||
      config.temperature < 0 ||
      config.temperature > 1
    ) {
      return { valid: false, message: "temperature must be 0.0-1.0" }
    }
  }

  return { valid: true }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/runtime/validate-inference-config.ts
git commit -m "feat(runtime): add inference config range validator"
```

---

### Task 5: `bedrock.ts` accepts inference config override

**Files:**
- Modify: `apps/server/src/runtime/bedrock.ts` (extend `converse` signature + apply overrides)

- [ ] **Step 1: Replace `converse` and surrounding types**

Open `apps/server/src/runtime/bedrock.ts`. Replace the file content with:

```ts
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type Tool,
  type ContentBlock,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime"
import { config } from "../config.js"
import type { InferenceConfig } from "@ozap-office/shared"

const client = new BedrockRuntimeClient({ region: config.awsRegion })

const DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-6"
const MODEL_PREFIX = "us.anthropic."
const VALID_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-opus-4-7",
])
const DEFAULT_MAX_TOKENS = 4096
const RETRYABLE_ERRORS = [
  "ThrottlingException",
  "ServiceUnavailableException",
  "ModelStreamErrorException",
  "ModelTimeoutException",
  "InternalServerException",
]
const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

type ConverseInput = {
  messages: Message[]
  systemPrompt: string
  tools: Tool[]
  inferenceConfig?: InferenceConfig | null
}

type ConverseResult = {
  output: ContentBlock[]
  stopReason: string
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheWriteInputTokens: number
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isRetryable = (error: unknown): boolean => {
  const name = (error as { name?: string })?.name
  return name !== undefined && RETRYABLE_ERRORS.includes(name)
}

const computeBackoff = (attempt: number): number => {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt)
  const jitter = Math.random() * BASE_DELAY_MS
  return exponential + jitter
}

const resolveModelId = (model: string | undefined): string => {
  if (model && VALID_MODELS.has(model)) return `${MODEL_PREFIX}${model}`
  return DEFAULT_MODEL
}

export const converse = async ({
  messages,
  systemPrompt,
  tools,
  inferenceConfig,
}: ConverseInput): Promise<ConverseResult> => {
  const modelId = resolveModelId(inferenceConfig?.model)
  const maxTokens = inferenceConfig?.maxTokens ?? DEFAULT_MAX_TOKENS
  const temperature = inferenceConfig?.temperature

  const additionalModelRequestFields = inferenceConfig?.thinking?.enabled
    ? {
        thinking: {
          type: "enabled",
          budget_tokens: inferenceConfig.thinking.budgetTokens,
        },
      }
    : undefined

  const cachedTools: Tool[] =
    tools.length > 0 ? [...tools, { cachePoint: { type: "default" } } as Tool] : []

  const command = new ConverseCommand({
    modelId,
    system: [
      { text: systemPrompt },
      { cachePoint: { type: "default" } } as SystemContentBlock,
    ],
    messages,
    toolConfig: cachedTools.length > 0 ? { tools: cachedTools } : undefined,
    inferenceConfig: {
      maxTokens,
      ...(temperature !== undefined && { temperature }),
    },
    ...(additionalModelRequestFields && { additionalModelRequestFields }),
  })

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.send(command)
      return {
        output: response.output?.message?.content ?? [],
        stopReason: response.stopReason ?? "end_turn",
        usage: {
          inputTokens: response.usage?.inputTokens ?? 0,
          outputTokens: response.usage?.outputTokens ?? 0,
          cacheReadInputTokens: response.usage?.cacheReadInputTokens ?? 0,
          cacheWriteInputTokens: response.usage?.cacheWriteInputTokens ?? 0,
        },
      }
    } catch (error) {
      if (attempt === MAX_ATTEMPTS - 1 || !isRetryable(error)) throw error
      console.warn(
        `[bedrock] retry ${attempt + 1}/${MAX_ATTEMPTS} after ${
          (error as { name?: string })?.name ?? "error"
        }`
      )
      await sleep(computeBackoff(attempt))
    }
  }
  throw new Error("Unreachable")
}
```

The only changes vs. the existing file are: importing `InferenceConfig`, adding `MODEL_PREFIX` + `VALID_MODELS` + `resolveModelId`, taking `inferenceConfig?` in the input type, and applying it in the command. The retry loop and cache points are unchanged.

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: errors at the call sites of `converse` in `executor.ts` because they don't pass `inferenceConfig` yet. Don't commit — Task 6 fixes those.

If errors appear in any OTHER file, STOP and report.

---

### Task 6: `executor.ts` passes `inferenceConfig` to `converse`

**Files:**
- Modify: `apps/server/src/runtime/executor.ts:295` (build `agentWithPrompt` with inferenceConfig)
- Modify: `apps/server/src/runtime/executor.ts:330-332` (widen `runAgenticLoop` agent type)
- Modify: `apps/server/src/runtime/executor.ts` inside `runAgenticLoop` (pass inferenceConfig to `converse`)
- Modify: `apps/server/src/runtime/executor.ts:464` (pass inferenceConfig in `executeAgentForMeeting`)
- Modify: `apps/server/src/runtime/executor.ts:558` (pass inferenceConfig in `resumeAfterApproval`)

- [ ] **Step 1: Widen the `runAgenticLoop` agent param type**

Find `runAgenticLoop` (around line 330). Change the agent param type:

```ts
const runAgenticLoop = async (
  agent: { id: string; systemPrompt: string; inferenceConfig: InferenceConfig | null },
  taskRunId: string,
  messages: Message[],
  agentTools: ToolDefinition[],
  bedrockTools: any[],
  delegationCtx?: DelegationContext
): Promise<void> => {
```

Add the import at the top of the file (next to other type imports):

```ts
import type { AgentEventType, ToolDefinition, InferenceConfig } from "@ozap-office/shared"
```

(Replace the existing line that imports `AgentEventType, ToolDefinition` from `@ozap-office/shared`.)

- [ ] **Step 2: Pass `inferenceConfig` into `converse` inside the loop**

Inside `runAgenticLoop`, find the `await converse({ ... })` call. Update it:

```ts
    const result = await converse({
      messages,
      systemPrompt: agent.systemPrompt,
      tools: bedrockTools,
      inferenceConfig: agent.inferenceConfig,
    })
```

- [ ] **Step 3: Update `executeAgent`'s `agentWithPrompt`**

Around line 295, replace:

```ts
const agentWithPrompt = { id: agent.id, systemPrompt }
```

with:

```ts
const agentWithPrompt = {
  id: agent.id,
  systemPrompt,
  inferenceConfig: agent.inferenceConfig as InferenceConfig | null,
}
```

- [ ] **Step 4: Update `executeAgentForMeeting`'s `agentWithMemory`**

Around line 464, find:

```ts
const agentWithMemory = { ...agent, systemPrompt: agent.systemPrompt + coreMemoryBlock }
```

The spread already includes `inferenceConfig` from the DB row, but Drizzle types it as `unknown`. Force the cast by replacing with:

```ts
const agentWithMemory = {
  ...agent,
  systemPrompt: agent.systemPrompt + coreMemoryBlock,
  inferenceConfig: agent.inferenceConfig as InferenceConfig | null,
}
```

- [ ] **Step 5: Update `resumeAfterApproval`'s `runAgenticLoop` call**

Around line 557, find:

```ts
  await runAgenticLoop(
    { id: agent.id, systemPrompt: agent.systemPrompt },
    approval.taskRunId,
    savedMessages,
    agentTools,
    bedrockTools
  )
```

Replace with:

```ts
  await runAgenticLoop(
    {
      id: agent.id,
      systemPrompt: agent.systemPrompt,
      inferenceConfig: agent.inferenceConfig as InferenceConfig | null,
    },
    approval.taskRunId,
    savedMessages,
    agentTools,
    bedrockTools
  )
```

- [ ] **Step 6: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors.

- [ ] **Step 7: Commit (Tasks 5 + 6 together)**

```bash
git add apps/server/src/runtime/bedrock.ts apps/server/src/runtime/executor.ts
git commit -m "feat(runtime): apply per-agent inferenceConfig override on bedrock calls"
```

---

### Task 7: PATCH endpoint in `routes/agents.ts`

**Files:**
- Modify: `apps/server/src/routes/agents.ts` (add new PATCH route)

- [ ] **Step 1: Add imports + new route**

Open `apps/server/src/routes/agents.ts`. Make sure these imports exist (add or update as needed at the top):

```ts
import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { agents } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { validateInferenceConfig } from "../runtime/validate-inference-config.js"
import type { InferenceConfig } from "@ozap-office/shared"
```

Inside `registerAgentRoutes` (line 8), add the PATCH endpoint as the FIRST handler (before `server.get("/api/agents", ...)`):

```ts
  server.patch<{
    Params: { id: string }
    Body: { inferenceConfig: InferenceConfig | null }
  }>("/api/agents/:id", async (request, reply) => {
    const { id } = request.params
    const { inferenceConfig } = request.body

    const validation = validateInferenceConfig(inferenceConfig)
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.message })
    }

    const [updated] = await db
      .update(agents)
      .set({ inferenceConfig, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning()

    if (!updated) return reply.code(404).send({ error: "Agent not found" })

    return updated
  })
```

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes/agents.ts
git commit -m "feat(api): add PATCH /api/agents/:id for inference config"
```

---

### Task 8: Frontend api-client method

**Files:**
- Modify: `apps/web/lib/api-client.ts:1` (import `InferenceConfig`)
- Modify: `apps/web/lib/api-client.ts` (add `updateAgentConfig` method)

- [ ] **Step 1: Add the import + method**

Open `apps/web/lib/api-client.ts`. Update line 1 to include `InferenceConfig`:

```ts
import type {
  AgentConfig,
  AgentEvent,
  Approval,
  ConversationMessage,
  InferenceConfig,
  Meeting,
  MeetingMessage,
  TaskRun,
} from "@ozap-office/shared"
```

Inside the `api` object, after `getAgent` (around line 33), add:

```ts
  updateAgentConfig: (id: string, inferenceConfig: InferenceConfig | null) =>
    request<AgentConfig>(`/api/agents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ inferenceConfig }),
    }),
```

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api-client.ts
git commit -m "feat(web): add updateAgentConfig api method"
```

---

### Task 9: TanStack Query hook `useUpdateAgentConfig`

**Files:**
- Modify: `apps/web/lib/queries/agent-queries.ts` (add new mutation hook)

- [ ] **Step 1: Add the hook**

Open `apps/web/lib/queries/agent-queries.ts`. Add (next to the other exports — at the end of the file is fine):

```ts
import type { InferenceConfig } from "@ozap-office/shared"

export const useUpdateAgentConfig = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      inferenceConfig,
    }: {
      id: string
      inferenceConfig: InferenceConfig | null
    }) => api.updateAgentConfig(id, inferenceConfig),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  })
}
```

If the file already imports `useMutation` and `useQueryClient` from `@tanstack/react-query`, don't duplicate. If not, add:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query"
```

(Read the file first to confirm what's already imported.)

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/queries/agent-queries.ts
git commit -m "feat(web): add useUpdateAgentConfig mutation hook"
```

---

### Task 10: AgentConfigPanel component

**Files:**
- Create: `apps/web/lib/components/agent-config-panel.tsx`

- [ ] **Step 1: Create the file**

Create `apps/web/lib/components/agent-config-panel.tsx` with:

```tsx
"use client"

import { useState, useEffect } from "react"
import { useUpdateAgentConfig } from "@/lib/queries/agent-queries"
import { Button } from "@/lib/components/ui/button"
import type { AgentConfig, InferenceConfig } from "@ozap-office/shared"

type Props = { agent: AgentConfig | null; open: boolean; onClose: () => void }

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (default)" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5 (fast/cheap)" },
  { value: "claude-opus-4-7", label: "Opus 4.7 (max quality)" },
] as const

const isEmpty = (c: InferenceConfig): boolean =>
  c.thinking === undefined &&
  c.model === undefined &&
  c.maxTokens === undefined &&
  c.temperature === undefined

export const AgentConfigPanel = ({ agent, open, onClose }: Props) => {
  const update = useUpdateAgentConfig()
  const [draft, setDraft] = useState<InferenceConfig>({})

  useEffect(() => {
    if (agent) setDraft(agent.inferenceConfig ?? {})
  }, [agent])

  if (!agent) return null

  const handleSave = () => {
    const cleaned = isEmpty(draft) ? null : draft
    update.mutate(
      { id: agent.id, inferenceConfig: cleaned },
      { onSuccess: onClose }
    )
  }

  const handleReset = () => {
    update.mutate(
      { id: agent.id, inferenceConfig: null },
      { onSuccess: onClose }
    )
  }

  return (
    <div
      className={`fixed top-0 right-0 h-full w-96 bg-surface border-l border-edge shadow-2xl z-50 transition-transform duration-200 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
        <h2 className="text-sm font-semibold">Config: {agent.name}</h2>
        <button
          onClick={onClose}
          className="text-mute hover:text-fg text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-4 space-y-6 overflow-y-auto h-[calc(100%-7rem)]">
        <section className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={draft.thinking?.enabled ?? false}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  thinking: e.target.checked
                    ? {
                        enabled: true,
                        budgetTokens: draft.thinking?.budgetTokens ?? 4096,
                      }
                    : undefined,
                })
              }
            />
            Extended thinking
          </label>
          {draft.thinking?.enabled && (
            <div className="pl-6">
              <div className="text-[10px] text-mute mb-1">
                Budget: {draft.thinking.budgetTokens} tokens
              </div>
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={draft.thinking.budgetTokens}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    thinking: {
                      enabled: true,
                      budgetTokens: Number(e.target.value),
                    },
                  })
                }
                className="w-full"
              />
            </div>
          )}
        </section>

        <section className="space-y-2">
          <label className="text-xs font-semibold">Model</label>
          <select
            value={draft.model ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                model: (e.target.value || undefined) as InferenceConfig["model"],
              })
            }
            className="w-full bg-canvas border border-edge rounded px-2 py-1 text-xs"
          >
            <option value="">Default (Sonnet 4.6)</option>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-2">
          <label className="flex justify-between text-xs font-semibold">
            <span>Max tokens</span>
            <span className="text-mute">
              {draft.maxTokens ?? "4096 (default)"}
            </span>
          </label>
          <input
            type="range"
            min={256}
            max={8192}
            step={256}
            value={draft.maxTokens ?? 4096}
            onChange={(e) =>
              setDraft({ ...draft, maxTokens: Number(e.target.value) })
            }
            className="w-full"
          />
        </section>

        <section className="space-y-2">
          <label className="flex justify-between text-xs font-semibold">
            <span>Temperature</span>
            <span className="text-mute">
              {draft.temperature !== undefined
                ? draft.temperature.toFixed(2)
                : "default"}
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={draft.temperature ?? 0.7}
            onChange={(e) =>
              setDraft({ ...draft, temperature: Number(e.target.value) })
            }
            className="w-full"
            disabled={draft.temperature === undefined}
          />
          <label className="flex items-center gap-1 text-[10px]">
            <input
              type="checkbox"
              checked={draft.temperature === undefined}
              onChange={(e) => {
                const next = { ...draft }
                if (e.target.checked) delete next.temperature
                else next.temperature = 0.7
                setDraft(next)
              }}
            />
            Use default (model decides)
          </label>
        </section>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-4 py-3 border-t border-edge flex gap-2 bg-surface">
        <Button
          size="sm"
          variant="outline"
          onClick={handleReset}
          disabled={update.isPending}
        >
          Reset to defaults
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={update.isPending}
          className="ml-auto"
        >
          {update.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/components/agent-config-panel.tsx
git commit -m "feat(web): add AgentConfigPanel slide-in"
```

---

### Task 11: Gear button + mount in `thought-panel.tsx`

**Files:**
- Modify: `apps/web/lib/components/thought-panel.tsx` (add import + state + button + mount)

- [ ] **Step 1: Add import for `AgentConfigPanel`**

In `apps/web/lib/components/thought-panel.tsx`, near the top imports (around line 11), add:

```ts
import { AgentConfigPanel } from "./agent-config-panel"
```

- [ ] **Step 2: Add `configOpen` state**

Inside the `ThoughtPanel` component body, near the other `useState` calls, add:

```tsx
const [configOpen, setConfigOpen] = useState(false)
```

- [ ] **Step 3: Add gear button in header**

Find the header section (around line 332-352). Insert a gear button **before** the close button (the one with `selectAgent(null)`). The result should look like:

```tsx
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
                    onClick={() => setConfigOpen(true)}
                    className="text-mute hover:text-sand transition-colors p-1"
                    title="Configure inference"
                    aria-label="Configure agent"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.76 2.76l1.42 1.42M9.82 9.82l1.42 1.42M2.76 11.24l1.42-1.42M9.82 4.18l1.42-1.42" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    onClick={() => selectAgent(null)}
                    className="text-mute hover:text-sand transition-colors p-1 -mr-1 -mt-0.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
```

The new button is the gear-icon SVG between the trash and close buttons.

- [ ] **Step 4: Mount `AgentConfigPanel` at the end of the component's JSX**

Find the outer `return (...)` of `ThoughtPanel`. The component currently returns a wrapper `<div>` (around line 315 — the `w-[400px]` panel). After that wrapper closes, but still inside the same return statement, mount the AgentConfigPanel as a sibling. To do that, wrap the existing return JSX in a `<>...</>` Fragment if it isn't already, and add the panel.

Read the existing return shape first. If it's currently `return ( <div className="w-[400px]..."> ... </div> )`, change it to:

```tsx
return (
  <>
    <div className="w-[400px] min-w-[400px] ...">
      ...existing content...
    </div>
    <AgentConfigPanel
      agent={selectedAgent ?? null}
      open={configOpen}
      onClose={() => setConfigOpen(false)}
    />
  </>
)
```

If `selectedAgent` is the variable name of the currently selected agent (per line 316: `{selectedAgent && (`), pass it directly. If it's named differently in your file, use that name. (Check line 316 to confirm.)

- [ ] **Step 5: Type-check**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/components/thought-panel.tsx
git commit -m "feat(web): add gear button + config panel mount in thought-panel"
```

---

### Task 12: Manual production validation

This is not a code task — it's the post-deploy checklist.

- [ ] **Step 1: Deploy**

Merge `harness-hardening-pr2` (or whatever branch you're on for this work) to `main`, push, and run the standard SSM full-rebuild block from `CLAUDE.md`. Wait for `Success`. Confirm `pm2 status` shows both processes online and the migration applied (`db:migrate` step in the SSM output).

- [ ] **Step 2: Verify schema**

```bash
AWS_PROFILE=ozapgpt aws ssm send-command \
  --instance-ids i-025ac97362e218181 \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["export HOME=/root && export $(grep -v ^# /opt/ozap-office/.env | xargs) && psql \"$DATABASE_URL\" -c \"\\d agents\""]}' \
  --timeout-seconds 30 --query "Command.CommandId" --output text --region us-east-1
```

Confirm `inference_config | jsonb |  | |` appears in the column list.

- [ ] **Step 3: Open the office UI, click Leader → ⚙**

Navigate to http://13.219.31.27/, click Leader on the canvas. Thought-panel opens. Click the gear icon in the header. AgentConfigPanel slides in from the right.

- [ ] **Step 4: Enable thinking, save**

Toggle Extended thinking ON. Set budget slider to ~4096. Click Save. Panel closes.

- [ ] **Step 5: Trigger Leader manually, observe**

Send a manual message to Leader (any prompt that needs reasoning, e.g., "Compare a performance dos agents nos últimos 7 dias e diga qual está mais ativo"). Wait for response.

Tail server logs and verify the model takes longer than baseline (thinking adds latency). Optionally, add a one-line `console.log(JSON.stringify(command.input).slice(0, 500))` to `bedrock.ts` temporarily to confirm `additionalModelRequestFields.thinking` is present in the payload.

- [ ] **Step 6: Reload page → re-open ⚙ → confirm persistence**

Reload http://13.219.31.27/. Click Leader → ⚙. Confirm Extended thinking is still ON with budget 4096 (proves DB round-trip).

- [ ] **Step 7: Reset to defaults**

Click "Reset to defaults" in the panel. Panel closes. Re-open ⚙ → Extended thinking should be OFF (proves null roundtrip).

- [ ] **Step 8: Test model override**

Open ⚙ on Promo (or any other agent). Set model to "Haiku 4.5". Save. Trigger a quick task. Tail logs and confirm the request hits `us.anthropic.claude-haiku-4-5` instead of Sonnet (response should be noticeably faster than baseline).

- [ ] **Step 9: Confirm seed doesn't clobber**

Run another full-rebuild SSM (which re-runs `db:seed`). After deploy, click ⚙ on Leader/Promo. Their `inferenceConfig` should still be set — proving the seed didn't touch the column.

---

## Self-review

- [x] Spec coverage:
  - Schema (spec §Schema) → Tasks 2 + 3
  - Types (spec §Types) → Task 1
  - Backend (spec §Backend changes) → Tasks 4 (validator), 5 (bedrock), 6 (executor), 7 (route)
  - Frontend (spec §Frontend changes) → Tasks 8, 9, 10, 11
  - Validation behavior (spec §Validation behavior) → covered by Task 4 + Task 10's UI logic
  - Manual production validation (spec §Manual production validation) → Task 12
- [x] Placeholder scan: no TBD/TODO/"appropriate"/"similar to" markers.
- [x] Type consistency: `InferenceConfig`, `validateInferenceConfig`, `useUpdateAgentConfig`, `AgentConfigPanel`, model literal strings — all consistent across tasks.
- [x] No `config_updated` event references (removed during spec self-review — TanStack Query mutation handles invalidation).
- [x] All 3 `runAgenticLoop` call sites covered in Task 6 (executeAgent, executeAgentForMeeting, resumeAfterApproval).
