# Agent Config UI — Design

**Date:** 2026-05-01
**Author:** Marcus + Claude
**Status:** Awaiting user approval before implementation plan

## Context

Today, agent configuration (system prompt, tools, schedule, inference settings) is hard-coded in `apps/server/src/db/seed.ts`. Any tweak requires editing TS, redeploying, and reseeding. This blocks fast iteration on inference parameters — especially extended thinking, which we'd like to enable per-agent without touching code.

This spec adds a minimal UI for editing **inference config per agent**. It does not introduce a full agent editor (prompt/tools/schedule remain seeded from code). The seed-vs-UI source-of-truth question is resolved by keeping `seed.ts` authoritative for everything **except** `inferenceConfig`, which the seed never writes.

Out of scope (future specs if needed): editing system prompt, tools, schedule, color, position via UI; agent creation; agent deletion.

## Goals

- **Per-agent extended thinking** — toggle on/off + budget tokens slider
- **Per-agent model override** — pick Sonnet 4.6 / Haiku 4.5 / Opus 4.7
- **Per-agent `maxTokens` and `temperature` overrides** — slider + checkbox for "use default"
- **No redeploy needed** — UI saves directly to DB, takes effect on the next run

## Architecture

```
┌─ apps/server/src/db/ ───────────────────────────────┐
│  schema.ts        ← inference_config jsonb (nullable)│
│  drizzle/         ← 1 additive migration            │
└──────────────────────────────────────────────────────┘

┌─ apps/server/src/runtime/ ──────────────────────────┐
│  bedrock.ts                ← converse() takes       │
│                              optional inferenceConfig│
│  executor.ts               ← passes agent.inferenceConfig │
│  validate-inference-config.ts ← new (range checks)  │
└──────────────────────────────────────────────────────┘

┌─ apps/server/src/routes/ ───────────────────────────┐
│  agents.ts        ← PATCH /api/agents/:id           │
└──────────────────────────────────────────────────────┘

┌─ apps/web/lib/ ─────────────────────────────────────┐
│  api-client.ts                ← updateAgentConfig() │
│  queries/agent-queries.ts     ← useUpdateAgentConfig│
│  components/agent-config-panel.tsx  ← new (slide-in)│
│  components/thought-panel.tsx ← gear button + mount │
└──────────────────────────────────────────────────────┘

┌─ packages/shared/src/ ──────────────────────────────┐
│  types.ts         ← InferenceConfig type            │
│                   ← AgentConfig.inferenceConfig     │
└──────────────────────────────────────────────────────┘
```

## Flow

1. User selects an agent on the office canvas → `thought-panel` opens
2. User clicks the gear icon (⚙) in `thought-panel` header → `AgentConfigPanel` slides in from the right
3. Form shows current `inferenceConfig` (with default placeholders for unset fields)
4. User toggles thinking, picks model, adjusts sliders → clicks **Save**
5. Frontend calls `PATCH /api/agents/:id` with `{ inferenceConfig }`
6. Backend validates ranges, updates the row, returns the updated agent
7. Frontend mutation onSuccess invalidates `["agents"]` query → store refreshes → next agent run uses new config
8. `runtime/bedrock.ts converse()` reads `agent.inferenceConfig` and applies overrides on top of global defaults

## Schema

### `apps/server/src/db/schema.ts`

```ts
export const agents = pgTable("agents", {
  // existing fields (id, name, role, systemPrompt, tools, schedule, ...)
  inferenceConfig: jsonb("inference_config"),  // NEW (nullable)
  // ...
})
```

Migration is purely additive. `null` means "use global defaults" — no backfill needed for existing rows.

### `seed.ts` is NOT modified

The seed continues upserting everything else (`role`, `systemPrompt`, `tools`, `schedule`, `cronPrompt`, `position`, `color`). It does **not** include `inferenceConfig` in the SET clause. Result: redeploys never overwrite UI edits to inference settings.

## Types (`packages/shared/src/types.ts`)

```ts
export type InferenceConfig = {
  thinking?: { enabled: boolean; budgetTokens: number }
  model?: "claude-sonnet-4-6" | "claude-haiku-4-5" | "claude-opus-4-7"
  maxTokens?: number
  temperature?: number
}

export type AgentConfig = {
  // existing fields
  inferenceConfig: InferenceConfig | null
  // ...
}
```

All subfields are optional. A user can set only `thinking` and leave `model`/`maxTokens`/`temperature` at globals — each lever is independent.

Valid ranges (enforced by backend):
- `thinking.budgetTokens`: 1024–16384
- `maxTokens`: 256–8192
- `temperature`: 0.0–1.0
- `model`: must be one of the 3 listed strings

## Backend changes

### `apps/server/src/runtime/bedrock.ts`

`converse()` accepts `inferenceConfig?: InferenceConfig | null`. Applies overrides on top of `DEFAULT_MODEL` / `DEFAULT_MAX_TOKENS`:

```ts
const MODEL_PREFIX = "us.anthropic."
const VALID_MODELS = new Set(["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-7"])

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

  // existing retry loop unchanged
}
```

`additionalModelRequestFields` is the Bedrock Converse API's escape hatch for provider-specific options (Anthropic's `thinking` lives there).

### `apps/server/src/runtime/executor.ts`

Inside `runAgenticLoop`, pass `agent.inferenceConfig` to `converse`:

```ts
const result = await converse({
  messages,
  systemPrompt: agent.systemPrompt,
  tools: bedrockTools,
  inferenceConfig: agent.inferenceConfig,
})
```

The `agent` parameter shape passed into `runAgenticLoop` widens from `{ id, systemPrompt }` to `{ id, systemPrompt, inferenceConfig }`. Update the 3 call sites (`executeAgent`, `executeAgentForMeeting`, `resumeAfterApproval`) to pass `inferenceConfig` too.

### `apps/server/src/runtime/validate-inference-config.ts` (new)

```ts
import type { InferenceConfig } from "@ozap-office/shared"

const VALID_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-opus-4-7",
])

type Validation = { valid: true } | { valid: false; message: string }

export const validateInferenceConfig = (config: InferenceConfig | null): Validation => {
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
    if (typeof config.maxTokens !== "number" || config.maxTokens < 256 || config.maxTokens > 8192) {
      return { valid: false, message: "maxTokens must be 256-8192" }
    }
  }

  if (config.temperature !== undefined) {
    if (typeof config.temperature !== "number" || config.temperature < 0 || config.temperature > 1) {
      return { valid: false, message: "temperature must be 0.0-1.0" }
    }
  }

  return { valid: true }
}
```

### `apps/server/src/routes/agents.ts` — PATCH endpoint

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

No WS event is emitted: TanStack Query's `onSuccess` invalidation already refreshes `["agents"]` for the client that saved. Other tabs would only see a stale `agentConfig` for at most 30s (TanStack Query's default refetchOnMount behavior or a manual reload). Acceptable for solo dev.

## Frontend changes

### `apps/web/lib/api-client.ts`

```ts
updateAgentConfig: (id: string, inferenceConfig: InferenceConfig | null) =>
  request<AgentConfig>(`/api/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ inferenceConfig }),
  }),
```

### `apps/web/lib/queries/agent-queries.ts`

```ts
export const useUpdateAgentConfig = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, inferenceConfig }: { id: string; inferenceConfig: InferenceConfig | null }) =>
      api.updateAgentConfig(id, inferenceConfig),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  })
}
```

### `apps/web/lib/components/agent-config-panel.tsx` (new)

Slide-in panel from the right (same pattern as `approvals-panel.tsx`). 4 sections: Thinking (checkbox + slider), Model (select), Max tokens (slider), Temperature (slider with "use default" checkbox). Footer with Reset / Save buttons.

`Save` sends the current draft (with empty object normalized to `null`). `Reset to defaults` sends `null` directly (clears the row).

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
]

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
    update.mutate({ id: agent.id, inferenceConfig: cleaned }, { onSuccess: onClose })
  }

  const handleReset = () => {
    update.mutate({ id: agent.id, inferenceConfig: null }, { onSuccess: onClose })
  }

  return (
    <div
      className={`fixed top-0 right-0 h-full w-96 bg-surface border-l border-edge shadow-2xl z-50 transition-transform duration-200 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
        <h2 className="text-sm font-semibold">Config: {agent.name}</h2>
        <button onClick={onClose} className="text-mute hover:text-fg text-lg" aria-label="Close">×</button>
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
                    ? { enabled: true, budgetTokens: draft.thinking?.budgetTokens ?? 4096 }
                    : undefined,
                })
              }
            />
            Extended thinking
          </label>
          {draft.thinking?.enabled && (
            <div className="pl-6">
              <div className="text-[10px] text-mute mb-1">Budget: {draft.thinking.budgetTokens} tokens</div>
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={draft.thinking.budgetTokens}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    thinking: { enabled: true, budgetTokens: Number(e.target.value) },
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
              setDraft({ ...draft, model: (e.target.value || undefined) as InferenceConfig["model"] })
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
            <span className="text-mute">{draft.maxTokens ?? "4096 (default)"}</span>
          </label>
          <input
            type="range"
            min={256}
            max={8192}
            step={256}
            value={draft.maxTokens ?? 4096}
            onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) })}
            className="w-full"
          />
        </section>

        <section className="space-y-2">
          <label className="flex justify-between text-xs font-semibold">
            <span>Temperature</span>
            <span className="text-mute">
              {draft.temperature !== undefined ? draft.temperature.toFixed(2) : "default"}
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={draft.temperature ?? 0.7}
            onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
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
        <Button size="sm" variant="outline" onClick={handleReset} disabled={update.isPending}>
          Reset to defaults
        </Button>
        <Button size="sm" onClick={handleSave} disabled={update.isPending} className="ml-auto">
          {update.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
```

### `apps/web/lib/components/thought-panel.tsx`

Add a gear icon button in the header that opens `AgentConfigPanel` with the currently selected agent.

```tsx
const [configOpen, setConfigOpen] = useState(false)
const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null

// in the header section, near the agent name:
<button
  onClick={() => setConfigOpen(true)}
  className="text-mute hover:text-fg p-1"
  aria-label="Configure agent"
  title="Configure inference"
>
  ⚙
</button>

// at the end of the component:
<AgentConfigPanel
  agent={selectedAgent}
  open={configOpen}
  onClose={() => setConfigOpen(false)}
/>
```

## Validation behavior

- Slider for `temperature` is **disabled** when "Use default" checkbox is checked
- "Reset to defaults" sends `null` to the API → column becomes NULL → next run uses globals
- Empty draft (no fields set) is normalized to `null` on Save
- Backend validates ranges and returns 400 on invalid input; the frontend mutation will surface the error via `useMutation`'s `error` state (toast wiring is optional; not required for v1)

## Manual production validation

Same pattern as previous specs (no automated tests):

1. Click the Leader agent on the canvas → thought-panel opens
2. Click ⚙ → config panel slides in
3. Toggle Extended thinking on, set budget to 4096
4. Save → panel closes
5. Manually trigger Leader (any prompt) → wait for response
6. Check server logs for the Bedrock request — should show `additionalModelRequestFields.thinking` set
7. Verify the response time is longer than baseline (thinking takes time)
8. Reload page → click ⚙ on Leader → confirm Thinking is still on with budget 4096 (persisted)
9. Click Reset to defaults → save → click ⚙ again → confirm Thinking is off
10. Repeat for model override (try Haiku on a small task, confirm faster response)

## Risk register

| Risk | Mitigation |
|---|---|
| Bad config breaks an agent | Backend range validation; UI also constrains ranges via slider min/max. Reset button clears to defaults instantly. |
| Old code paths use `agent` without `inferenceConfig` | TypeScript type widening forces all 3 callers of `runAgenticLoop` to provide it. Compile-time guarantee. |
| Seed clobbers UI edits on next deploy | Spec explicitly excludes `inferenceConfig` from the seed UPDATE clause. Verified by checking `seed.ts:989-1002` is NOT modified. |
| Thinking budget too high → slow runs | Cap at 16384. Sonnet 4.6's max thinking budget per call. |
| Model name breaking change from Anthropic | Hardcoded list of 3 valid models in shared types + validator. Update list when Anthropic ships a new model. |
| Concurrent edits (2 tabs open) | Last-write-wins. Acceptable for solo dev. |

## Deploy

- Schema migration generated by `pnpm db:generate` (additive ALTER TABLE ADD COLUMN)
- Standard build + pm2 restart
- Seed re-runs (skips `inferenceConfig` per design — existing rows untouched)

## Non-goals (explicit)

- Don't introduce a test framework (consistent with prior specs)
- Don't allow editing `systemPrompt`, `tools`, `schedule`, `cronPrompt`, `color`, `position` via UI
- Don't add agent CRUD (create/delete via UI)
- Don't add `topP`, `topK`, `stopSequences`, or other inference knobs beyond the 4 listed
- Don't add config history / audit trail (could come later)
- Don't add per-call config override (always per-agent)
