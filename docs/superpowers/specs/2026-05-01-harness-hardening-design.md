# Harness Hardening — Design

**Date:** 2026-05-01
**Author:** Marcus + Claude
**Status:** Awaiting user approval before implementation plan

## Context

An audit of the agent harness (main execution loop in `apps/server/src/runtime/`) identified 4 critical fixes against modern (2026) practices:

1. Loop has no step cap nor `maxTokens` — risk of runaway Bedrock cost
2. No retries on transient Bedrock errors — runs fail silently on throttling
3. Human approval is advisory only (string returned by the tool) — does not interrupt the loop, just blocks execution; agent can't complete tasks that depend on approval
4. No prompt caching — pays repeatedly for identical system prompts and tool schemas on every cron run

Current score: 6.0/10. This spec addresses all 4 fixes.

Out of scope (future specs if needed): extended thinking, streaming, AbortSignal cancellation, pgvector for archival memory, refactor of tool-executor to a registry pattern.

## Goals

- **Reliability:** runs no longer fail because of a transient Bedrock blip
- **Predictable cost:** loop never exceeds N steps / M tokens
- **Reduced cost:** ~80% fewer input tokens on cron runs via prompt caching
- **Real autonomy:** when an agent needs human approval, it suspends, and on approval it **executes the operation** (today it just "informs the user" and ends)

## Philosophy (non-goal)

Human approval is reserved for **operations that spend real money and aren't easily reversible**. Concretely: `activateCampaign` and `updateBudget` increases on Meta Ads. Does not extend to `postTweet`, `updatePromoConfig`, `startPriceTest`, etc. — those should run autonomously via cron, which is the whole point of the office.

## Packaging strategy

Two sequential PRs:

**PR1 — Runtime hardening** (fixes 1, 2, 4)
- Touches only `bedrock.ts` and `executor.ts`
- No schema, no UI, no new deps
- No observable behavior change (except: runs cost less, recover from throttle, and stop at 25 steps)
- Low risk

**PR2 — Real approval** (fix 3)
- Backend: schema (1 new column + 2 renamed payload fields), executor, new `runtime/tool-gateway.ts`, `tools/ads.ts`, `routes/approvals.ts`
- Frontend: new query, new panel (Sheet), badge in status-bar, WS integration
- Observable behavior change: Ads agent now suspends and resumes
- Medium risk (more files, new flow)

PR1 ships first to provide a foundation (cap + retries protect PR2 against bugs in the new flow).

## Architecture

```
┌─ apps/server/src/runtime/ ──────────────────────────┐
│  bedrock.ts          ← PR1: retries + maxTokens     │
│                        + cache points                │
│  executor.ts         ← PR1: iterative loop + cap    │
│                      ← PR2: detect guarded before   │
│                        executing tool, suspend       │
│  tool-executor.ts    ← unchanged                    │
│  tool-gateway.ts     ← PR2: new (move + generalize  │
│                        existing ads-gateway.ts)      │
└──────────────────────────────────────────────────────┘

┌─ apps/server/src/db/ ───────────────────────────────┐
│  schema.ts           ← PR2: approvals table changes │
│  drizzle/            ← PR2: 1 additive migration    │
└──────────────────────────────────────────────────────┘

┌─ apps/web/lib/ ─────────────────────────────────────┐
│  queries/approval-queries.ts     ← PR2: new         │
│  components/approvals-panel.tsx  ← PR2: new         │
│  components/status-bar.tsx       ← PR2: badge       │
│  stores/ws-store.ts              ← PR2: invalidate  │
│                                    on approval_*    │
└──────────────────────────────────────────────────────┘
```

## PR1 — Runtime hardening

### `apps/server/src/runtime/bedrock.ts`

Adds:
- `maxTokens: 4096` in `inferenceConfig`
- 2 cache points: after the system prompt, after the tools list
- Retry with exponential backoff + jitter for transient errors (`ThrottlingException`, `ServiceUnavailableException`, `ModelStreamErrorException`, `InternalServerException`). 3 attempts, 500ms base.
- Returns `cacheReadInputTokens` and `cacheWriteInputTokens` in `usage` for observability

```ts
const DEFAULT_MAX_TOKENS = 4096
const RETRYABLE_ERRORS = [
  "ThrottlingException",
  "ServiceUnavailableException",
  "ModelStreamErrorException",
  "InternalServerException",
]
const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const isRetryable = (error: unknown): boolean => {
  const name = (error as { name?: string })?.name
  return name !== undefined && RETRYABLE_ERRORS.includes(name)
}

const computeBackoff = (attempt: number): number => {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt)
  const jitter = Math.random() * BASE_DELAY_MS
  return exponential + jitter
}

export const converse = async ({
  messages,
  systemPrompt,
  tools,
  modelId = DEFAULT_MODEL,
}: ConverseInput): Promise<ConverseResult> => {
  const cachedTools: Tool[] = tools.length > 0
    ? [...tools, { cachePoint: { type: "default" } } as Tool]
    : []

  const command = new ConverseCommand({
    modelId,
    system: [
      { text: systemPrompt },
      { cachePoint: { type: "default" } } as SystemContentBlock,
    ],
    messages,
    toolConfig: cachedTools.length > 0 ? { tools: cachedTools } : undefined,
    inferenceConfig: { maxTokens: DEFAULT_MAX_TOKENS },
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
          cacheReadInputTokens: response.usage?.cacheReadInputTokenCount ?? 0,
          cacheWriteInputTokens: response.usage?.cacheWriteInputTokenCount ?? 0,
        },
      }
    } catch (error) {
      if (attempt === MAX_ATTEMPTS - 1 || !isRetryable(error)) throw error
      await sleep(computeBackoff(attempt))
    }
  }
  throw new Error("Unreachable")
}
```

### `apps/server/src/runtime/executor.ts`

Convert `runAgenticLoop` from tail-recursive to iterative with a cap:

```ts
const MAX_STEPS = 25

const runAgenticLoop = async (
  agent: { id: string; systemPrompt: string },
  taskRunId: string,
  messages: Message[],
  agentTools: ToolDefinition[],
  bedrockTools: any[],
  delegationCtx?: DelegationContext
): Promise<void> => {
  const accumulatedTexts: string[] = []
  let step = 0

  while (step < MAX_STEPS) {
    step++
    await updateAgentStatus(agent.id, "thinking")
    await emitEvent(agent.id, taskRunId, "thinking", "Processing...", { step })

    const result = await converse({
      messages,
      systemPrompt: agent.systemPrompt,
      tools: bedrockTools,
    })

    const textContent = extractTextContent(result.output)
    const toolUseBlocks = extractToolUseBlocks(result.output)

    if (textContent) {
      accumulatedTexts.push(textContent)
      await emitEvent(agent.id, taskRunId, "message", textContent)
    }

    if (result.stopReason !== "tool_use" || toolUseBlocks.length === 0) break

    await updateAgentStatus(agent.id, "working")
    messages.push({ role: "assistant", content: result.output })

    const toolResultContents: ContentBlock[] = []
    for (const block of toolUseBlocks) {
      const { toolUse } = block

      // PR2 inserts guarded interrupt here

      await emitEvent(agent.id, taskRunId, "tool_call", toolUse.name!, { input: toolUse.input })

      const toolResult = await executeTool(
        agent.id,
        toolUse.name!,
        toolUse.input as Record<string, unknown>,
        agentTools,
        delegationCtx
      )

      await emitEvent(agent.id, taskRunId, "tool_result", toolResult.content, {
        toolName: toolUse.name,
        isError: toolResult.isError,
      })

      toolResultContents.push({
        toolResult: {
          toolUseId: toolUse.toolUseId!,
          content: [{ text: toolResult.content }],
          status: toolResult.isError ? "error" : "success",
        },
      })
    }

    messages.push({ role: "user", content: toolResultContents })
  }

  if (step >= MAX_STEPS) {
    await emitEvent(
      agent.id,
      taskRunId,
      "error",
      `Loop step cap reached (${MAX_STEPS}). Forcing termination.`
    )
  }

  const fullResponse = accumulatedTexts.join("\n\n")
  await db
    .update(taskRuns)
    .set({ status: "completed", output: { result: fullResponse }, completedAt: new Date() })
    .where(eq(taskRuns.id, taskRunId))
  await emitEvent(agent.id, taskRunId, "completed", fullResponse || "Task completed")
}
```

**Decisions:**
- Step cap default 25, configurable from day one via env `MAX_AGENT_STEPS` (read from `config.ts`, default 25 if not set).
- When the cap fires: emit an `error` event but mark the taskRun as `completed` with partial text (not `failed`) — preserves whatever insight was produced.
- `accumulatedTexts` is now local (not passed across recursive calls).
- Step count goes in metadata of the `thinking` event — optional for UI to show "step 3/25".

## PR2 — Real approval

### Schema (`apps/server/src/db/schema.ts`)

**Current state** (verified at `schema.ts:75-83`):
```ts
export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskRunId: uuid("task_run_id").notNull().references(() => taskRuns.id),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})
```

**Required changes:**

```ts
export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskRunId: uuid("task_run_id")
    .notNull()
    .references(() => taskRuns.id, { onDelete: "cascade" }),  // add cascade
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),    // add cascade
  toolName: text("tool_name").notNull(),                       // NEW
  toolInput: jsonb("tool_input").notNull(),                    // NEW
  suspendedMessages: jsonb("suspended_messages"),              // NEW (nullable) — full snapshot of messages including toolUseIds
  payload: jsonb("payload"),                                   // kept nullable for compat with old rows (if any)
  status: text("status").notNull().default("pending"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})
```

**Migration plan:**
1. `pnpm db:generate` produces ALTER TABLE with 3 new columns (`tool_name`, `tool_input`, `suspended_messages`) + relax `payload` notNull (becomes nullable) + cascade on FKs
2. Drizzle may not handle FK constraint changes inline — if so, hand-author the migration: `ALTER TABLE approvals DROP CONSTRAINT approvals_task_run_id_fkey, ADD CONSTRAINT approvals_task_run_id_fkey FOREIGN KEY (task_run_id) REFERENCES task_runs(id) ON DELETE CASCADE`. Same for agentId.
3. Old rows in `approvals` (if any) won't have the new fields — keep `payload` as a fallback. New code writes to `toolName`/`toolInput`/`suspendedMessages` and ignores `payload`. Inspect old rows after deploy — likely the table is empty (the approval path has never completed end-to-end in practice).

### `apps/server/src/runtime/tool-gateway.ts` (new)

Replaces `apps/server/src/tools/ads-gateway.ts`. Generalized for cross-agent use:

```ts
import { config } from "../config.js"

type Classification = { level: "free" | "guarded"; reason?: string }

const GUARDED_OPS: Record<string, (input: Record<string, unknown>) => Classification> = {
  activateCampaign: () => ({
    level: "guarded",
    reason: "Activating a campaign spends real money on Meta Ads",
  }),
  updateBudget: (input) => {
    const newDailyBudget = input.newDailyBudget as number | undefined
    const currentDailyBudget = input.currentDailyBudget as number | undefined
    if (
      newDailyBudget !== undefined &&
      currentDailyBudget !== undefined &&
      newDailyBudget > currentDailyBudget
    ) {
      return { level: "guarded", reason: "Budget increase spends more real money on Meta Ads" }
    }
    return { level: "free" }
  },
}

export const classifyToolCall = (
  toolName: string,
  input: Record<string, unknown>
): Classification => {
  const checker = GUARDED_OPS[toolName]
  return checker ? checker(input) : { level: "free" }
}

export const validateBudgetLimit = (dailyBudget: number) => {
  // copy of the existing implementation in ads-gateway.ts
  if (dailyBudget <= 0) return { valid: false, message: "Daily budget must be greater than zero" }
  if (dailyBudget > config.adsDailyBudgetLimit) {
    return {
      valid: false,
      message: `Daily budget R$${dailyBudget} exceeds the limit of R$${config.adsDailyBudgetLimit}`,
    }
  }
  return { valid: true, message: `Daily budget R$${dailyBudget} is within the allowed limit` }
}
```

`apps/server/src/tools/ads-gateway.ts` is deleted. `apps/server/src/tools/ads.ts` imports from `runtime/tool-gateway.ts`.

### `apps/server/src/tools/ads.ts`

Drop `guardedResponse` and the early-return in `activateCampaign` — the tool now **executes for real**:

```ts
const activateCampaign = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const campaignId = input.campaignId as string
  if (!campaignId) return { content: "campaignId is required", isError: true }

  const result = await callMcpTool("update_campaign", {
    campaign_id: campaignId,
    status: "ACTIVE",
  })
  return extractMcpText(result)
}
```

`updateBudget` keeps the `validateBudgetLimit` check (absolute cap), but without `guardedResponse` on the increase path — the executor's gateway handles that. Keep the "REQUER APROVAÇÃO HUMANA" wording in the tool description (`seed.ts:235, 257`) so the model understands the implication.

### `apps/server/src/runtime/executor.ts` — interrupt

**Bedrock requires 1:1** between `toolUse` blocks in an assistant turn and `toolResult` blocks in the next user turn. We can't just execute some tools and skip others — the next `Converse` call breaks with a schema error.

**Strategy:** BEFORE entering the for-loop over tools, scan all `toolUseBlocks`. If **any** is guarded, suspend **the whole turn** without executing any of them. If none is guarded, run the for-loop normally.

```ts
import { classifyToolCall } from "./tool-gateway.js"
import { approvals } from "../db/schema.js"

// inside runAgenticLoop, after extracting toolUseBlocks and before the normal for-loop:
const guardedToolUse = toolUseBlocks.find((block) => {
  const classification = classifyToolCall(
    block.toolUse.name!,
    block.toolUse.input as Record<string, unknown>
  )
  return classification.level === "guarded"
})

if (guardedToolUse) {
  const { toolUse: guardedTool } = guardedToolUse
  const classification = classifyToolCall(
    guardedTool.name!,
    guardedTool.input as Record<string, unknown>
  )

  messages.push({ role: "assistant", content: result.output })

  await db.insert(approvals).values({
    agentId: agent.id,
    taskRunId,
    toolName: guardedTool.name!,
    toolInput: guardedTool.input,
    status: "pending",
    suspendedMessages: messages,
  })

  await db
    .update(taskRuns)
    .set({ status: "awaiting_approval" })
    .where(eq(taskRuns.id, taskRunId))

  await emitEvent(
    agent.id,
    taskRunId,
    "approval_requested",
    classification.reason ?? "Approval required",
    { toolName: guardedTool.name, toolInput: guardedTool.input }
  )

  await updateAgentStatus(agent.id, "awaiting_approval")
  return  // exit runAgenticLoop without completing taskRun
}

// happy path: run the toolUseBlocks for-loop as before
```

**Note:** the `toolUseId`s of the other tools in the same turn don't need to be persisted separately — they're already in `suspendedMessages` (the assistant message contains all `toolUse` blocks). `resumeAfterApproval` reconstructs the list from there.

**On resume (`resumeAfterApproval`)** — detailed in the next block:
- Approve: actually execute only the guarded tool with `approval.toolInput`; for every other `toolUseId`, inject a placeholder tool_result
- Reject: guarded tool gets `"Rejected by user."`; others get the same placeholder
- In both cases the resulting user turn has N tool_results (one per toolUseId from the previous turn)

### `apps/server/src/runtime/executor.ts` — `resumeAfterApproval`

Rewrite: today it reads `taskRuns.input as Message[]`, but `input` only stores `{ context }`. Reads from `approvals.suspendedMessages` instead.

```ts
export const resumeAfterApproval = async (
  approvalId: string,
  action: "approve" | "reject"
) => {
  const [approval] = await db.select().from(approvals).where(eq(approvals.id, approvalId))
  if (!approval) return

  const savedMessages = approval.suspendedMessages as Message[] | null
  if (!savedMessages) return

  const [agent] = await db.select().from(agents).where(eq(agents.id, approval.agentId))
  if (!agent) return

  const lastAssistant = savedMessages[savedMessages.length - 1]

  // resolve toolUseId of the tool being approved/rejected
  const lastAssistantToolUses = (lastAssistant?.content as ContentBlock[] | undefined)
    ?.filter((b) => b.toolUse !== undefined)
    .map((b) => b.toolUse!) ?? []
  const approvedToolUse = lastAssistantToolUses.find(
    (t) => t.name === approval.toolName
  )

  let resumeContent: string
  let isError = false

  if (action === "approve") {
    const toolResult = await executeTool(
      agent.id,
      approval.toolName,
      approval.toolInput as Record<string, unknown>,
      agent.tools as ToolDefinition[]
    )
    resumeContent = toolResult.content
    isError = toolResult.isError ?? false
  } else {
    resumeContent = `Rejected by user. Do not execute ${approval.toolName}.`
  }

  // build tool_result for every toolUseId from the previous turn (Bedrock requires 1:1)
  const toolResultBlocks: ContentBlock[] = lastAssistantToolUses.map((tu) => {
    if (tu.toolUseId === approvedToolUse?.toolUseId) {
      return {
        toolResult: {
          toolUseId: tu.toolUseId!,
          content: [{ text: resumeContent }],
          status: isError ? "error" : "success",
        },
      }
    }
    return {
      toolResult: {
        toolUseId: tu.toolUseId!,
        content: [{ text: "Operation cancelled by suspension. Re-issue in a separate turn if still needed." }],
        status: "success",
      },
    }
  })

  savedMessages.push({ role: "user", content: toolResultBlocks })

  await db
    .update(taskRuns)
    .set({ status: "running" })
    .where(eq(taskRuns.id, approval.taskRunId))
  await updateAgentStatus(approval.agentId, "working")

  const agentTools = agent.tools as ToolDefinition[]
  const bedrockTools = buildBedrockTools(agentTools)
  await runAgenticLoop(
    { id: agent.id, systemPrompt: agent.systemPrompt },
    approval.taskRunId,
    savedMessages,
    agentTools,
    bedrockTools
  )
  await updateAgentStatus(approval.agentId, "idle")
}
```

**Key guarantee:** when approved, the **harness** invokes the tool with `approval.toolInput` (not the model's input). This prevents the model from changing parameters between suspend and resume.

### `apps/server/src/routes/approvals.ts`

Update to pass `approval.id` instead of `approval.taskRunId`:

```ts
await resumeAfterApproval(approval.id, action)
```

And emit an `approval_decided` event so the front-end query invalidates:

```ts
eventBus.emit("agentEvent", {
  agentId: approval.agentId,
  taskRunId: approval.taskRunId,
  type: "approval_decided",
  content: action === "approve" ? "Approved" : "Rejected",
  metadata: { approvalId: approval.id, toolName: approval.toolName },
})
```

### `packages/shared` — types

Add to `AgentEventType`:
- `"approval_requested"`
- `"approval_decided"`

Add to valid agent statuses: `"awaiting_approval"`. Add to valid taskRun statuses: `"awaiting_approval"`.

### `apps/server/src/db/seed.ts` — Ads agent system prompt

Lines 669-670 today (Portuguese, kept because it's a product-facing agent):
```
- Ativação de campanhas (activateCampaign) REQUER aprovação humana — informe o usuário
- Aumento de orçamento (updateBudget quando novo > atual) REQUER aprovação humana
```

Update to:
```
- Você pode chamar activateCampaign diretamente — o sistema pausará automaticamente até o humano aprovar via UI
- Você pode chamar updateBudget diretamente — aumentos de orçamento serão pausados automaticamente até aprovação humana via UI
```

Otherwise the agent will keep flagging the operation in text before calling the tool, leading to a duplicated flow.

### Frontend

#### `apps/web/lib/queries/approval-queries.ts` (new)

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "../api-client"

export const useApprovals = () =>
  useQuery({
    queryKey: ["approvals"],
    queryFn: () => api.getApprovals(),
    refetchInterval: 30_000,
  })

export const useDecideApproval = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      api.decideApproval(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  })
}
```

#### `apps/web/lib/components/approvals-panel.tsx` (new)

A shadcn Sheet sliding from the right with a list of pending approvals. Each item: agent name, tool name, formatted JSON input, approve/reject buttons. ~80 lines.

#### `apps/web/lib/components/status-bar.tsx`

Add an amber badge with the count when `approvals.length > 0`; clicking opens the panel:

```tsx
{approvals.length > 0 && (
  <button
    onClick={() => setPanelOpen(true)}
    className="px-2 py-1 rounded bg-amber-500/20 text-amber-700 text-xs font-semibold hover:bg-amber-500/30"
  >
    {approvals.length} pending approval{approvals.length > 1 ? "s" : ""}
  </button>
)}
<ApprovalsPanel open={panelOpen} onOpenChange={setPanelOpen} />
```

#### `apps/web/lib/stores/ws-store.ts`

When an `approval_requested` or `approval_decided` event arrives, invalidate `["approvals"]` on the QueryClient.

## End-to-end flow (PR2)

```
1. Cron 02:00 fires the Ads agent
2. Agent analyzes → decides to activate a campaign
3. Tool call activateCampaign({ campaignId: "X" })
4. Harness: classifyToolCall → guarded
5. Harness:
   - INSERT approvals (status=pending, suspendedMessages=snapshot)
   - UPDATE taskRuns SET status='awaiting_approval'
   - emit approval_requested event
   - agent status = awaiting_approval
   - return (loop terminates)
6. Frontend: WS receives approval_requested → invalidates query
7. Status bar: "1 pending approval" (amber badge)
8. Marcus clicks → Sheet opens → sees tool + input
9. Approves → POST /api/approvals/:id action=approve
10. Backend:
    - UPDATE approvals SET status='approved'
    - resumeAfterApproval(approval.id, 'approve')
    - executeTool('activateCampaign', saved toolInput) → MCP → Meta API
    - inject success tool_result
    - runAgenticLoop continues
11. Model receives tool_result, completes the turn ("Campaign X activated successfully")
12. taskRun status = completed
13. Frontend: WS approval_decided → invalidates query → badge disappears
```

## Manual production validation

No automated tests (confirmed choice — project has no framework). 100% manual validation after each deploy:

**After PR1:**
1. Trigger an agent manually via UI → check server logs for `cacheReadInputTokens`. First call in the session: cacheRead=0, cacheWrite>0. Second: cacheRead>0.
2. Force throttling: run 5 cron triggers in parallel via `pnpm db:seed` + manual triggers. Watch logs for `Retry attempt` (add a log line for that).
3. Step cap: give the agent a deliberately impossible task ("iterate this empty list until done") and verify it stops at 25 steps.

**After PR2:**
1. Trigger Ads agent manually with prompt "Activate campaign {test campaign id}".
2. Verify: "1 pending" badge appears, Sheet shows tool/input, taskRun status awaiting_approval.
3. Approve → check Meta Ads Manager → campaign ACTIVE.
4. Verify the agent resumes and ends the turn with a confirmation message.
5. Repeat with reject — verify campaign stays PAUSED and the agent responds correctly.

## Risk register

| Risk | Mitigation |
|---|---|
| Step cap too low (25) | Configurable via env `MAX_AGENT_STEPS`. |
| Retries cause double-trigger | Bedrock Converse is stateless — retry is safe. |
| Unexpected cache miss | `cacheReadInputTokens=0` shows up in logs/usage; quick to debug. |
| Tool input modified between suspend and resume | Mitigated: `executeTool` on resume uses `approval.toolInput`, not model input. |
| Orphan approval (taskRun deleted) | Schema today has **no** cascade. Migration adds `onDelete: cascade` on `taskRunId` and `agentId`. |
| Frontend panel not updating live | Fallback `refetchInterval: 30s` + WS invalidate on `approval_*`. |
| Multiple tools in the same turn with 1 guarded | Suspends the whole turn and injects placeholder tool_results on resume (Bedrock requires 1:1 toolUse↔toolResult). |
| Race in `approvals` (double simultaneous decision) | `routes/approvals.ts` already checks `status !== 'pending'` before deciding. |
| Migration blocks deploy | Additive and nullable — in-flight runs are safe. |

## Deploy

**PR1:**
- No schema, no deps. Standard build + pm2 restart.
- Immediate validation: log of the first cron run shows `cacheReadInputTokens` on the second call.

**PR2:**
- Run migration: `pnpm db:generate && pnpm db:migrate` during deploy
- Standard build + pm2 restart
- Re-run seed (Ads system prompt updated): `pnpm db:seed`
- Manual validation per the section above

## Non-goals (explicit)

- Don't introduce a test framework (Marcus's decision on 2026-05-01)
- Don't extend the guarded list to postTweet/updatePromoConfig/price tests (autonomy first)
- Don't refactor tool-executor to a registry pattern
- Don't add extended thinking, streaming, AbortSignal, pgvector
- Don't alter cron / scheduler / meeting engine logic
