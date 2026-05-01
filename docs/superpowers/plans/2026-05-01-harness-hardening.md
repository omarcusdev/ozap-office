# Harness Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Bedrock-driven agent harness with a step cap, retries, prompt caching, and a real human-approval interrupt.

**Architecture:** Two sequential PRs. PR1 mutates only `apps/server/src/runtime/{bedrock.ts, executor.ts}` plus `config.ts` for runtime hardening (loop cap + retries + cache points). PR2 adds a real approval gate: a generalized `runtime/tool-gateway.ts`, schema migration adding `tool_name`/`tool_input`/`suspended_messages` to `approvals`, executor changes to suspend/resume, and a minimal frontend (queries hook + slide-in panel + status-bar badge + WS invalidation). No automated tests — validation is manual in production.

**Tech Stack:** TypeScript (Node 20, ESM) + Fastify + Drizzle/Postgres on the server, Next.js 15 + React 19 + Tailwind v4 + TanStack Query + Zustand + shadcn/ui on the web. AWS Bedrock Converse for inference.

**Reference:** `docs/superpowers/specs/2026-05-01-harness-hardening-design.md`

**No automated tests** (project has no test framework — confirmed 2026-05-01). Each task ends with type-check + commit. End-of-PR manual production validation steps are listed at the end of each PR section.

**Spec deviations baked into this plan:**
- Use the existing `approval_needed` event type (already in `AgentEventType`) instead of inventing `approval_requested`.
- Use existing `waiting_approval` taskRun status (already in `TaskRunStatus`) instead of `awaiting_approval`. Add `waiting_approval` to `AgentStatus`.
- Approval panel uses a fixed-position slide-in `<div>` styled with Tailwind (matching `thought-panel.tsx` pattern), not shadcn `Sheet` — Sheet isn't installed and Dialog feels too heavy for an internal review panel.

---

## PR1 — Runtime Hardening

### Task 1: Add `MAX_AGENT_STEPS` to config

**Files:**
- Modify: `apps/server/src/config.ts:24` (add new key)

- [ ] **Step 1: Add the new config field**

Edit `apps/server/src/config.ts` — add `maxAgentSteps` inside the exported `config` object, right after `port`:

```ts
  port: Number(process.env.PORT ?? 3001),
  maxAgentSteps: Number(process.env.MAX_AGENT_STEPS ?? 25),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
```

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/config.ts
git commit -m "chore: add MAX_AGENT_STEPS env knob (default 25)"
```

---

### Task 2: Bedrock retries + maxTokens + prompt caching

**Files:**
- Modify: `apps/server/src/runtime/bedrock.ts` (replace whole file content below)

- [ ] **Step 1: Rewrite `bedrock.ts`**

Replace the whole content of `apps/server/src/runtime/bedrock.ts` with:

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

const client = new BedrockRuntimeClient({ region: config.awsRegion })

const DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-6"
const DEFAULT_MAX_TOKENS = 4096
const RETRYABLE_ERRORS = [
  "ThrottlingException",
  "ServiceUnavailableException",
  "ModelStreamErrorException",
  "InternalServerException",
]
const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

type ConverseInput = {
  messages: Message[]
  systemPrompt: string
  tools: Tool[]
  modelId?: string
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

export const converse = async ({
  messages,
  systemPrompt,
  tools,
  modelId = DEFAULT_MODEL,
}: ConverseInput): Promise<ConverseResult> => {
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
      console.warn(
        `[bedrock] retry ${attempt + 1}/${MAX_ATTEMPTS} after ${(error as { name?: string })?.name ?? "error"}`
      )
      await sleep(computeBackoff(attempt))
    }
  }
  throw new Error("Unreachable")
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors.

If errors mention `cachePoint` not on `Tool`/`SystemContentBlock` — the AWS SDK version may not expose the type yet. The `as Tool` / `as SystemContentBlock` casts handle that.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/runtime/bedrock.ts
git commit -m "feat(runtime): add bedrock retries, maxTokens, and prompt caching"
```

---

### Task 3: Convert `runAgenticLoop` to iterative with step cap

**Files:**
- Modify: `apps/server/src/runtime/executor.ts:324-394` (replace `runAgenticLoop` function)

- [ ] **Step 1: Add `config` import at top**

Open `apps/server/src/runtime/executor.ts`. The first import block currently has no `config` import — add one. After the existing import of `executeTool` (line 6), add:

```ts
import { config } from "../config.js"
```

- [ ] **Step 2: Replace `runAgenticLoop`**

Find the existing `runAgenticLoop` function in `apps/server/src/runtime/executor.ts` (starts around line 324, ends ~line 394). Replace the whole function with:

```ts
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

  while (step < config.maxAgentSteps) {
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

      await emitEvent(agent.id, taskRunId, "tool_call", toolUse.name!, {
        input: toolUse.input,
      })

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

  if (step >= config.maxAgentSteps) {
    await emitEvent(
      agent.id,
      taskRunId,
      "error",
      `Loop step cap reached (${config.maxAgentSteps}). Forcing termination.`
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

Notes:
- The `accumulatedTexts: string[] = []` parameter from the recursive version is gone — it's now a local.
- `MAX_STEPS` constant is gone — the cap reads from `config.maxAgentSteps` for runtime configurability.

- [ ] **Step 3: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/runtime/executor.ts
git commit -m "feat(runtime): convert runAgenticLoop to iterative with step cap"
```

---

### Task 4: Manual production validation of PR1

This is not a code task — it's a checklist for after the deploy of tasks 1–3.

- [ ] **Step 1: Deploy PR1**

Use the standard deploy command from `CLAUDE.md` (full-rebuild SSM block). Wait for completion, then check `pm2 status` — both processes should be `online`.

- [ ] **Step 2: Verify prompt caching**

Trigger the Ads agent twice in a row from the office UI (give it a no-op prompt like "Liste as 3 campanhas mais recentes"). Pull server logs:

```bash
AWS_PROFILE=ozapgpt aws ssm send-command \
  --instance-ids i-025ac97362e218181 \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["export HOME=/root && cat /root/.pm2/logs/ozap-office-server-out.log | tail -100"]}' \
  --timeout-seconds 30 \
  --query "Command.CommandId" --output text --region us-east-1
```

Look for `cacheReadInputTokens` in the converse result. First call: should be 0. Second call within ~5 minutes: should be > 0.

If it's always 0: the `cachePoint` blocks aren't taking effect. Likely a Bedrock SDK version that doesn't pass them through. Inspect the actual `ConverseCommand` payload by adding a temp `console.log(JSON.stringify(command.input))` before `client.send`.

- [ ] **Step 3: Verify retry path**

Tail logs while triggering 4–5 agents in parallel (open the office in 4 tabs, hit different agents at the same time). Look for `[bedrock] retry` lines. If Bedrock isn't actually throttling, this step is best-effort — the retry code is still exercised in production over time.

- [ ] **Step 4: Verify step cap**

Open the Promo agent in conversation mode and send: "Loop chamando getActivePromo até eu mandar parar." Wait. The loop should stop at step 25 with an `error` event reading "Loop step cap reached (25). Forcing termination." in the thought panel.

---

## PR2 — Real Approval Gate

### Task 5: Update shared types

**Files:**
- Modify: `packages/shared/src/types.ts:1` (extend `AgentStatus`)
- Modify: `packages/shared/src/types.ts:39-49` (extend `AgentEventType`)
- Modify: `packages/shared/src/types.ts:63-71` (extend `Approval`)

- [ ] **Step 1: Add `waiting_approval` to `AgentStatus`**

Replace line 1 with:

```ts
export type AgentStatus = "idle" | "working" | "thinking" | "waiting" | "waiting_approval" | "meeting" | "error" | "has_report"
```

- [ ] **Step 2: Add `approval_decided` to `AgentEventType`**

Replace lines 39–49 with:

```ts
export type AgentEventType =
  | "user_message"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "message"
  | "approval_needed"
  | "approval_decided"
  | "completed"
  | "error"
  | "delegation_start"
  | "delegation_response"
```

(Note: `approval_needed` is already there — we reuse it instead of inventing `approval_requested`.)

- [ ] **Step 3: Extend `Approval` type with new fields**

Replace lines 63–71 with:

```ts
export type Approval = {
  id: string
  taskRunId: string
  agentId: string
  toolName: string
  toolInput: unknown
  suspendedMessages: unknown
  payload: unknown
  status: ApprovalStatus
  decidedAt: Date | null
  createdAt: Date
}
```

- [ ] **Step 4: Build the shared package**

Run: `pnpm -F @ozap-office/shared build`
Expected: no errors, `packages/shared/dist/` updated.

- [ ] **Step 5: Type-check both apps**

Run: `pnpm -F @ozap-office/server typecheck && pnpm -F @ozap-office/web typecheck`
Expected: no errors. (If the `agent-store` exhaustively switches on `AgentStatus`, you'll get a missing-case warning — search/fix.)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/dist
git commit -m "types: add waiting_approval status, approval_decided event, approval new fields"
```

---

### Task 6: Update `approvals` schema with new columns and FK cascades

**Files:**
- Modify: `apps/server/src/db/schema.ts:75-83` (replace `approvals` table definition)

- [ ] **Step 1: Replace the `approvals` table definition**

Find the `approvals` table in `apps/server/src/db/schema.ts` (line 75). Replace the whole `pgTable("approvals", { ... })` block with:

```ts
export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskRunId: uuid("task_run_id")
    .notNull()
    .references(() => taskRuns.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  toolName: text("tool_name").notNull(),
  toolInput: jsonb("tool_input").notNull(),
  suspendedMessages: jsonb("suspended_messages"),
  payload: jsonb("payload"),
  status: text("status").notNull().default("pending"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors.

(Don't commit yet — next task generates the migration as part of the same change.)

---

### Task 7: Generate and inspect the Drizzle migration

**Files:**
- Create: `apps/server/drizzle/0007_<random>.sql` (Drizzle picks the name — don't pre-commit a path)

- [ ] **Step 1: Generate migration**

Run: `pnpm -F @ozap-office/server db:generate`
Expected: a new SQL file appears in `apps/server/drizzle/`. Note its name.

- [ ] **Step 2: Inspect generated SQL**

Open the new file. Verify it contains all of:
- `ADD COLUMN "tool_name" text NOT NULL` (or wrapped in a deferred step — see Step 3 if Drizzle complains)
- `ADD COLUMN "tool_input" jsonb NOT NULL`
- `ADD COLUMN "suspended_messages" jsonb`
- `ALTER COLUMN "payload" DROP NOT NULL`
- `DROP CONSTRAINT` + `ADD CONSTRAINT ... ON DELETE CASCADE` for both `task_run_id_fkey` and `agent_id_fkey`

- [ ] **Step 3: Hand-fix the migration if needed**

Drizzle may not allow `ADD COLUMN ... NOT NULL` against a table with existing rows. The `approvals` table is **likely empty** (the current code path never finishes a real approval), but verify on production:

```bash
AWS_PROFILE=ozapgpt aws ssm send-command \
  --instance-ids i-025ac97362e218181 \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["export HOME=/root && export PGPASSWORD=$(grep DATABASE_URL /opt/ozap-office/.env | cut -d: -f3 | cut -d@ -f1) && psql $(grep DATABASE_URL /opt/ozap-office/.env | cut -d= -f2) -c \"SELECT COUNT(*) FROM approvals;\""]}' \
  --timeout-seconds 30 --query "Command.CommandId" --output text --region us-east-1
```

If count is 0: leave the migration as generated.

If count > 0: edit the migration to add columns as nullable first, then a `UPDATE approvals SET tool_name = '<unknown>', tool_input = '{}'::jsonb WHERE tool_name IS NULL` step, then `ALTER COLUMN ... SET NOT NULL`. Save the file.

If Drizzle didn't include the FK constraint changes, append them by hand:

```sql
ALTER TABLE "approvals" DROP CONSTRAINT "approvals_task_run_id_task_runs_id_fk";
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_task_run_id_task_runs_id_fk"
  FOREIGN KEY ("task_run_id") REFERENCES "task_runs"("id") ON DELETE CASCADE;

ALTER TABLE "approvals" DROP CONSTRAINT "approvals_agent_id_agents_id_fk";
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_id_agents_id_fk"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;
```

(Constraint names follow Drizzle's `<table>_<column>_<ref-table>_<ref-column>_fk` convention. Verify against `apps/server/drizzle/meta/_journal.json` if uncertain.)

- [ ] **Step 4: Commit schema + migration together**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/
git commit -m "feat(db): extend approvals with tool_name, tool_input, suspended_messages + cascades"
```

---

### Task 8: Create `runtime/tool-gateway.ts` (replaces `tools/ads-gateway.ts`)

**Files:**
- Create: `apps/server/src/runtime/tool-gateway.ts`
- Modify: `apps/server/src/tools/ads.ts:2` (update import path)
- Delete: `apps/server/src/tools/ads-gateway.ts`

- [ ] **Step 1: Create the new gateway**

Create `apps/server/src/runtime/tool-gateway.ts` with:

```ts
import { config } from "../config.js"

type Classification = { level: "free" | "guarded"; reason?: string }

const GUARDED_OPS: Record<
  string,
  (input: Record<string, unknown>) => Classification
> = {
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
      return {
        level: "guarded",
        reason: "Budget increase spends more real money on Meta Ads",
      }
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

type BudgetValidation = { valid: boolean; message: string }

export const validateBudgetLimit = (dailyBudget: number): BudgetValidation => {
  if (dailyBudget <= 0) {
    return { valid: false, message: "Daily budget must be greater than zero" }
  }
  if (dailyBudget > config.adsDailyBudgetLimit) {
    return {
      valid: false,
      message: `Daily budget R$${dailyBudget} exceeds the limit of R$${config.adsDailyBudgetLimit}`,
    }
  }
  return {
    valid: true,
    message: `Daily budget R$${dailyBudget} is within the allowed limit`,
  }
}
```

- [ ] **Step 2: Update import in `tools/ads.ts`**

In `apps/server/src/tools/ads.ts:2`, change:

```ts
import { classifyOperation, validateBudgetLimit } from "./ads-gateway.js"
```

to:

```ts
import { classifyToolCall, validateBudgetLimit } from "../runtime/tool-gateway.js"
```

(`classifyOperation` was the old name. We replace its call sites in the next task.)

- [ ] **Step 3: Delete the old gateway file**

```bash
rm apps/server/src/tools/ads-gateway.ts
```

- [ ] **Step 4: Type-check (will fail — that's fine, fixed in Task 9)**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: errors in `tools/ads.ts` referencing `classifyOperation`. Don't commit yet — Task 9 fixes those.

---

### Task 9: Strip guardedResponse from `tools/ads.ts`

**Files:**
- Modify: `apps/server/src/tools/ads.ts:21-24` (delete `guardedResponse`)
- Modify: `apps/server/src/tools/ads.ts:214-217` (rewrite `activateCampaign`)
- Modify: `apps/server/src/tools/ads.ts:233-249` (clean up `updateBudget`)

- [ ] **Step 1: Delete `guardedResponse` helper**

In `apps/server/src/tools/ads.ts`, delete the function defined around lines 21–24 (the `const guardedResponse = (reason: string): ToolResult => ({ ... })` block).

- [ ] **Step 2: Rewrite `activateCampaign`**

Replace the existing `activateCampaign` function (around line 214) with:

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

- [ ] **Step 3: Clean up `updateBudget`**

Find `updateBudget` (around line 233). Remove the `classifyOperation` block that returns `guardedResponse` on increase (lines 242–245 in the original). Keep the `validateBudgetLimit` check. The function should look like:

```ts
const updateBudget = async (input: Record<string, unknown>): Promise<ToolResult> => {
  const campaignId = input.campaignId as string
  const newDailyBudget = input.newDailyBudget as number

  if (!campaignId || newDailyBudget === undefined) {
    return { content: "campaignId and newDailyBudget are required", isError: true }
  }

  const budgetCheck = validateBudgetLimit(newDailyBudget)
  if (!budgetCheck.valid) {
    return { content: budgetCheck.message, isError: true }
  }

  const result = await callMcpTool("update_adset_budget", {
    campaign_id: campaignId,
    daily_budget: newDailyBudget,
  })
  return extractMcpText(result)
}
```

(If the actual MCP tool name / params differ from the snippet above, **preserve whatever the existing `updateBudget` does after the now-deleted classification block**. The point of this step is only to remove the guarded short-circuit, not to alter the MCP call.)

- [ ] **Step 4: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors.

- [ ] **Step 5: Commit (this and Task 8 together)**

```bash
git add apps/server/src/runtime/tool-gateway.ts apps/server/src/tools/ads.ts
git rm apps/server/src/tools/ads-gateway.ts
git commit -m "refactor(runtime): generalize ads-gateway into runtime/tool-gateway"
```

---

### Task 10: Add guarded interrupt detection to `runAgenticLoop`

**Files:**
- Modify: `apps/server/src/runtime/executor.ts` (add import + insert detection block before the `for (const block of toolUseBlocks)`)

- [ ] **Step 1: Add imports at top**

In `apps/server/src/runtime/executor.ts`, near the existing imports, add:

```ts
import { classifyToolCall } from "./tool-gateway.js"
```

The file already imports `approvals` indirectly via `db/schema.js` because of `events`/`agentMemories` imports — verify on line 3: should already include `agentMemories, conversationMessages, conversationSessions`. Add `approvals` to that import line:

```ts
import { agents, taskRuns, events, agentMemories, conversationMessages, conversationSessions, approvals } from "../db/schema.js"
```

- [ ] **Step 2: Insert guarded check inside the loop**

Inside `runAgenticLoop`, find the line `await updateAgentStatus(agent.id, "working")` followed by `messages.push({ role: "assistant", content: result.output })` (these run after `if (result.stopReason !== "tool_use" || toolUseBlocks.length === 0) break`).

**Right after** `messages.push({ role: "assistant", content: result.output })` and **before** the `const toolResultContents: ContentBlock[] = []` line, insert:

```ts
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
        .set({ status: "waiting_approval" })
        .where(eq(taskRuns.id, taskRunId))

      await emitEvent(
        agent.id,
        taskRunId,
        "approval_needed",
        classification.reason ?? "Approval required",
        { toolName: guardedTool.name, toolInput: guardedTool.input }
      )

      await updateAgentStatus(agent.id, "waiting_approval")
      return
    }
```

The `messages.push({ role: "assistant", content: result.output })` already pushed the assistant turn — the snapshot in `suspendedMessages` includes it. Don't duplicate the push.

- [ ] **Step 3: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors. If `block.toolUse` complains about possibly-undefined access, the existing `extractToolUseBlocks` already narrows it — no extra cast needed.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/runtime/executor.ts
git commit -m "feat(runtime): suspend loop on guarded tool calls"
```

---

### Task 11: Rewrite `resumeAfterApproval`

**Files:**
- Modify: `apps/server/src/runtime/executor.ts:425-449` (replace `resumeAfterApproval` function)

- [ ] **Step 1: Replace the function**

Find `resumeAfterApproval` (around line 425). Replace the whole function with:

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
  const lastAssistantToolUses =
    (lastAssistant?.content as ContentBlock[] | undefined)
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
        content: [
          {
            text: "Operation cancelled by suspension. Re-issue in a separate turn if still needed.",
          },
        ],
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

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/runtime/executor.ts
git commit -m "feat(runtime): resumeAfterApproval reads from approval row, executes guarded tool with saved input"
```

---

### Task 12: Update approvals route to pass approval id and emit `approval_decided`

**Files:**
- Modify: `apps/server/src/routes/approvals.ts:1-37` (rewrite)

- [ ] **Step 1: Replace the file content**

Replace the whole content of `apps/server/src/routes/approvals.ts` with:

```ts
import type { FastifyInstance } from "fastify"
import { db } from "../db/client.js"
import { approvals } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { resumeAfterApproval } from "../runtime/executor.js"
import { eventBus } from "../events/event-bus.js"

export const registerApprovalRoutes = (server: FastifyInstance) => {
  server.get("/api/approvals", async () => {
    return db.select().from(approvals).where(eq(approvals.status, "pending"))
  })

  server.post<{
    Params: { id: string }
    Body: { action: "approve" | "reject" }
  }>("/api/approvals/:id", async (request, reply) => {
    const { id } = request.params
    const { action } = request.body

    const [approval] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, id))

    if (!approval) return reply.code(404).send({ error: "Approval not found" })
    if (approval.status !== "pending")
      return reply.code(400).send({ error: "Approval already decided" })

    await db
      .update(approvals)
      .set({
        status: action === "approve" ? "approved" : "rejected",
        decidedAt: new Date(),
      })
      .where(eq(approvals.id, id))

    eventBus.emit("agentEvent", {
      id: crypto.randomUUID(),
      agentId: approval.agentId,
      taskRunId: approval.taskRunId,
      type: "approval_decided",
      content: action === "approve" ? "Approved" : "Rejected",
      metadata: { approvalId: approval.id, toolName: approval.toolName },
      timestamp: new Date(),
    })

    await resumeAfterApproval(approval.id, action)

    return { status: action === "approve" ? "approved" : "rejected" }
  })
}
```

Note: `resumeAfterApproval` is called with `approval.id` (was `approval.taskRunId` before). The event is emitted with a synthetic id since we're not persisting it as a normal event row.

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/server typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes/approvals.ts
git commit -m "feat(api): emit approval_decided event and pass approval id to resume"
```

---

### Task 13: Update Ads agent system prompt in seed

**Files:**
- Modify: `apps/server/src/db/seed.ts:669-670` (replace 2 lines)

- [ ] **Step 1: Replace the approval-related lines**

In `apps/server/src/db/seed.ts`, find the lines (around 669-670):

```
- Ativação de campanhas (activateCampaign) REQUER aprovação humana — informe o usuário
- Aumento de orçamento (updateBudget quando novo > atual) REQUER aprovação humana
```

Replace them with:

```
- Você pode chamar activateCampaign diretamente — o sistema pausará automaticamente até o humano aprovar via UI
- Você pode chamar updateBudget diretamente — aumentos de orçamento serão pausados automaticamente até aprovação humana via UI
```

(Kept in Portuguese — the Ads agent prompt is product-facing and that audience is Brazilian.)

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/db/seed.ts
git commit -m "chore(seed): update Ads prompt to reflect real approval gate"
```

---

### Task 14: Frontend — `approval-queries.ts`

**Files:**
- Create: `apps/web/lib/queries/approval-queries.ts`

- [ ] **Step 1: Create the file**

Create `apps/web/lib/queries/approval-queries.ts` with:

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

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/queries/approval-queries.ts
git commit -m "feat(web): add approval-queries hooks"
```

---

### Task 15: Frontend — `approvals-panel.tsx`

**Files:**
- Create: `apps/web/lib/components/approvals-panel.tsx`

- [ ] **Step 1: Create the panel**

Create `apps/web/lib/components/approvals-panel.tsx` with:

```tsx
"use client"

import { useApprovals, useDecideApproval } from "@/lib/queries/approval-queries"
import { useAgentStore } from "@/lib/stores/agent-store"
import { Button } from "@/lib/components/ui/button"

type Props = { open: boolean; onClose: () => void }

export const ApprovalsPanel = ({ open, onClose }: Props) => {
  const { data: approvals = [] } = useApprovals()
  const decide = useDecideApproval()
  const agents = useAgentStore((s) => s.agents)

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? "Agent"

  return (
    <div
      className={`fixed top-0 right-0 h-full w-96 bg-surface border-l border-edge shadow-2xl z-50 transition-transform duration-200 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
        <h2 className="text-sm font-semibold">Pending approvals</h2>
        <button
          onClick={onClose}
          className="text-mute hover:text-fg text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto h-[calc(100%-3rem)]">
        {approvals.length === 0 && (
          <p className="text-xs text-mute">Nothing pending.</p>
        )}
        {approvals.map((a) => {
          const toolInput = (a as unknown as { toolInput: unknown }).toolInput
          const toolName = (a as unknown as { toolName: string }).toolName
          return (
            <div key={a.id} className="border border-edge rounded p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold">{agentName(a.agentId)}</span>
                <span className="text-mute">
                  {new Date(a.createdAt).toLocaleTimeString("pt-BR")}
                </span>
              </div>
              <div className="font-mono text-xs">{toolName}</div>
              <pre className="text-[10px] bg-canvas p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(toolInput, null, 2)}
              </pre>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: a.id, action: "reject" })}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: a.id, action: "approve" })}
                >
                  Approve
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

The `as unknown as { toolInput: unknown }` cast is a stop-gap until the shared `Approval` type's new fields propagate through the build (Task 5 already added them — if the build cache is stale, run `pnpm -F @ozap-office/shared build` and the casts can come out in a follow-up cleanup).

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: no errors.

If `Button` import path is different (the file uses `@/lib/components/ui/button`), align with the existing pattern from `thought-panel.tsx` or other components. Same for `bg-surface`, `border-edge`, `text-mute`, `text-fg`, `bg-canvas` Tailwind tokens — they exist in the project per `status-bar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/components/approvals-panel.tsx
git commit -m "feat(web): add approvals slide-in panel"
```

---

### Task 16: Frontend — Status bar badge

**Files:**
- Modify: `apps/web/lib/components/status-bar.tsx` (replace whole file)

- [ ] **Step 1: Update status bar**

Replace the whole content of `apps/web/lib/components/status-bar.tsx` with:

```tsx
"use client"

import { useState } from "react"
import { useAgentStore } from "@/lib/stores/agent-store"
import { useApprovals } from "@/lib/queries/approval-queries"
import { ApprovalsPanel } from "./approvals-panel"

const StatusDot = ({
  count,
  label,
  color,
}: {
  count: number
  label: string
  color: string
}) => (
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
  const { data: approvals = [] } = useApprovals()
  const [panelOpen, setPanelOpen] = useState(false)

  const counts = agents.reduce(
    (acc, a) => {
      if (a.status === "working" || a.status === "thinking") acc.working++
      else if (a.status === "waiting" || a.status === "waiting_approval") acc.waiting++
      else if (a.status === "error") acc.error++
      else acc.idle++
      return acc
    },
    { working: 0, waiting: 0, error: 0, idle: 0 }
  )

  return (
    <>
      <div className="h-9 bg-surface border-t border-edge flex items-center px-5 gap-6">
        <StatusDot count={counts.working} label="active" color="var(--color-sage)" />
        <StatusDot count={counts.waiting} label="pending" color="var(--color-ember)" />
        <StatusDot count={counts.error} label="errors" color="var(--color-coral)" />
        <StatusDot count={counts.idle} label="idle" color="var(--color-mute)" />

        {approvals.length > 0 && (
          <button
            onClick={() => setPanelOpen(true)}
            className="ml-auto px-2 py-1 rounded bg-amber-500/20 text-amber-700 text-[11px] font-semibold hover:bg-amber-500/30"
          >
            {approvals.length} pending approval{approvals.length > 1 ? "s" : ""}
          </button>
        )}
      </div>

      <ApprovalsPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/components/status-bar.tsx
git commit -m "feat(web): badge + panel trigger in status bar"
```

---

### Task 17: WebSocket invalidation on approval events

**Files:**
- Modify: `apps/web/app/providers.tsx:30-49` (add invalidation logic)

- [ ] **Step 1: Add `useQueryClient` and invalidate on approval events**

In `apps/web/app/providers.tsx`, replace the `WebSocketProvider` component (lines 21–52) with:

```tsx
const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const updateStatus = useAgentStore((s) => s.updateStatus)
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId)
  const addEvent = useEventStore((s) => s.addEvent)
  const addMeetingMessage = useMeetingStore((s) => s.addMessage)
  const setConnected = useWsStore((s) => s.setConnected)
  const queryClient = useQueryClient()
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
        if (
          message.payload.type === "approval_needed" ||
          message.payload.type === "approval_decided"
        ) {
          queryClient.invalidateQueries({ queryKey: ["approvals"] })
        }
      } else if (message.type === "meeting_message") {
        addMeetingMessage(message.payload)
      }
    }

    const client = createWsClient(handleMessage, setConnected)

    return () => {
      client.disconnect()
      setConnected(false)
    }
  }, [updateStatus, addEvent, addMeetingMessage, setConnected, queryClient])

  return <>{children}</>
}
```

Add `useQueryClient` to the existing TanStack Query import at the top:

```tsx
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
```

- [ ] **Step 2: Type-check**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/providers.tsx
git commit -m "feat(web): invalidate approvals query on WS approval events"
```

---

### Task 18: Manual production validation of PR2

This is not a code task — it's a checklist for after the deploy of tasks 5–17.

- [ ] **Step 1: Deploy PR2**

Use the standard full-rebuild SSM command from `CLAUDE.md`. Confirm migration ran (`db:migrate` step in the SSM block), seed re-ran (`db:seed`), and both pm2 processes are `online`.

- [ ] **Step 2: Verify schema migration applied**

```bash
AWS_PROFILE=ozapgpt aws ssm send-command \
  --instance-ids i-025ac97362e218181 \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["export HOME=/root && export DATABASE_URL=$(grep DATABASE_URL /opt/ozap-office/.env | cut -d= -f2-) && psql \"$DATABASE_URL\" -c \"\\d approvals\""]}' \
  --timeout-seconds 30 --query "Command.CommandId" --output text --region us-east-1
```

Confirm the columns `tool_name`, `tool_input`, `suspended_messages` exist and the FKs say `ON DELETE CASCADE`.

- [ ] **Step 3: Trigger an approval**

In the office UI, send the Ads agent a manual prompt:

> "Ative a campanha {ID_DE_UMA_CAMPANHA_QUE_ESTÁ_PAUSADA}."

Replace the placeholder with a real PAUSED campaign id from Meta Ads Manager. Watch:
- Status bar shows `1 pending approval` after a few seconds
- Click the badge → panel slides in from the right showing the agent name, `activateCampaign`, the campaign id in the JSON input, and Approve/Reject buttons
- The thought panel for the Ads agent shows an `approval_needed` event

- [ ] **Step 4: Approve**

Click `Approve`. Verify:
- The approval disappears from the panel within a few seconds (WS invalidation)
- Meta Ads Manager shows the campaign as `ACTIVE`
- The Ads agent thought panel shows the loop continuing — a `tool_result` event with the MCP success output, then a final `message` event with a confirmation
- TaskRun status (visible via `getLatestRun` API or the UI) ends as `completed`

- [ ] **Step 5: Reject**

Trigger another activation prompt, then click `Reject`. Verify:
- Campaign stays `PAUSED` in Meta Ads
- The agent's last message references the rejection
- TaskRun status ends as `completed`

- [ ] **Step 6: Verify autonomy on non-guarded tools**

Trigger the Promo agent's normal cron path or its `postTweet` flow (X agent). Confirm **no** approval is requested — these tools are not in `GUARDED_OPS` and run autonomously, as intended.

---

## Self-review (already done by author)

- [x] Spec coverage: every spec section maps to a task. Loop cap → Task 3. Retries → Task 2. Caching → Task 2. Approval interrupt → Tasks 5–13. UI → Tasks 14–17.
- [x] Placeholder scan: no TBD/TODO/"appropriate"/"similar to" markers.
- [x] Type consistency: `classifyToolCall` (not `classifyOperation`) used everywhere; `waiting_approval` (not `awaiting_approval`); `approval_needed` (existing) reused; `approval_decided` (new) added.
- [x] Reused existing types where possible (TaskRunStatus already had `waiting_approval`; AgentEventType already had `approval_needed`).
