# Harness Hardening — Design

**Data:** 2026-05-01
**Autor:** Marcus + Claude
**Status:** Aguardando aprovação do user antes do plano de implementação

## Contexto

Auditoria do agent harness (loop principal de execução em `apps/server/src/runtime/`) identificou 4 fixes críticos vs práticas modernas (2026):

1. Loop sem step cap nem `maxTokens` — risco de runaway de custo Bedrock
2. Sem retries em erros transientes do Bedrock — runs falham silenciosamente em throttling
3. Aprovação humana é apenas advisory (string retornada pela tool) — não interrompe o loop, só impede a execução; agent não consegue concluir tarefas que dependem de aprovação
4. Sem prompt caching — paga repetidamente por system prompts e tool schemas idênticos a cada cron run

Score atual: 6.0/10. Esse spec endereça os 4 fixes.

Fora de escopo (vai pra specs futuros se necessário): extended thinking, streaming, AbortSignal cancelamento, pgvector pra archival memory, refactor do tool-executor pra registry pattern.

## Objetivos

- **Confiabilidade:** runs não falham mais por blip transiente do Bedrock
- **Custo previsível:** loop nunca passa de N steps / M tokens
- **Custo reduzido:** ~80% menos input tokens em runs de cron via prompt caching
- **Autonomia real:** agent que precisa de aprovação humana suspende, e ao aprovar, **executa a operação** (hoje ele só "informa o usuário" e termina)

## Filosofia (não-objetivo)

Aprovação humana é só pra **operações que gastam dinheiro real e não revertem fácil**. Concretamente: `activateCampaign` e aumento de `updateBudget` no Meta Ads. Não estende pra `postTweet`, `updatePromoConfig`, `startPriceTest`, etc — esses devem rodar autônomos via cron, que é o ponto do escritório.

## Estratégia de empacotamento

Dois PRs sequenciais:

**PR1 — Runtime hardening** (fixes 1, 2, 4)
- Mexe só em `bedrock.ts` e `executor.ts`
- Sem schema, sem UI, sem deps novas
- Sem mudança de comportamento observável (exceto: runs custam menos, recuperam de throttle, e param em 25 steps)
- Baixo risco

**PR2 — Aprovação real** (fix 3)
- Backend: schema (1 coluna nova), executor, novo `runtime/tool-gateway.ts`, `tools/ads.ts`, `routes/approvals.ts`
- Frontend: nova query, novo painel (Sheet), badge no status-bar, integração WS
- Mudança de comportamento observável: Ads agent agora suspende e retoma
- Risco médio (mais arquivos, novo fluxo)

PR1 vai primeiro pra dar foundation (cap + retries protegem PR2 contra bugs no novo fluxo).

## Arquitetura

```
┌─ apps/server/src/runtime/ ──────────────────────────┐
│  bedrock.ts          ← PR1: retries + maxTokens     │
│                        + cache points                │
│  executor.ts         ← PR1: loop iterativo + cap    │
│                      ← PR2: detecta guarded antes   │
│                        de executar tool, suspende   │
│  tool-executor.ts    ← inalterado                   │
│  tool-gateway.ts     ← PR2: novo (move + generaliza │
│                        ads-gateway.ts existente)    │
└──────────────────────────────────────────────────────┘

┌─ apps/server/src/db/ ───────────────────────────────┐
│  schema.ts           ← PR2: approvals.suspendedMessages │
│  drizzle/            ← PR2: 1 migration aditiva     │
└──────────────────────────────────────────────────────┘

┌─ apps/web/lib/ ─────────────────────────────────────┐
│  queries/approval-queries.ts     ← PR2: novo        │
│  components/approvals-panel.tsx  ← PR2: novo        │
│  components/status-bar.tsx       ← PR2: badge       │
│  stores/ws-store.ts              ← PR2: invalidate  │
│                                    em approval_*    │
└──────────────────────────────────────────────────────┘
```

## PR1 — Runtime hardening

### `apps/server/src/runtime/bedrock.ts`

Adiciona:
- `maxTokens: 4096` em `inferenceConfig`
- 2 cache points: depois do system prompt, depois das tools
- Retry com backoff exponencial + jitter pra erros transientes (`ThrottlingException`, `ServiceUnavailableException`, `ModelStreamErrorException`, `InternalServerException`). 3 tentativas, base 500ms.
- Retorna `cacheReadInputTokens` e `cacheWriteInputTokens` no `usage` pra observabilidade

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

Converte `runAgenticLoop` de tail-recursivo pra iterativo com cap:

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

**Decisões:**
- Step cap default 25, configurável desde já via env `MAX_AGENT_STEPS` (ler do `config.ts`, default 25 se não setada).
- Quando bate o cap: emite evento `error` mas marca taskRun como `completed` com texto parcial (não `failed`) — preserva insight.
- `accumulatedTexts` agora é local (não passado entre chamadas recursivas).
- Step count vai em metadata do evento `thinking` — opcional pra UI mostrar "step 3/25".

## PR2 — Aprovação real

### Schema (`apps/server/src/db/schema.ts`)

**Estado atual** (verificado em `schema.ts:75-83`):
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

**Mudanças necessárias:**

```ts
export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskRunId: uuid("task_run_id")
    .notNull()
    .references(() => taskRuns.id, { onDelete: "cascade" }),  // adiciona cascade
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),    // adiciona cascade
  toolName: text("tool_name").notNull(),                       // NOVO
  toolInput: jsonb("tool_input").notNull(),                    // NOVO
  suspendedMessages: jsonb("suspended_messages"),              // NOVO (nullable) — snapshot completo das messages incluindo toolUseIds
  payload: jsonb("payload"),                                   // mantém nullable pra compat com rows antigas (se houver)
  status: text("status").notNull().default("pending"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})
```

**Migration plan:**
1. `pnpm db:generate` gera ALTER TABLE com 3 colunas novas (`tool_name`, `tool_input`, `suspended_messages`) + relax do `payload` notNull (vira nullable) + cascade nos FKs
2. Drizzle pode ter limitação pra mudar FK constraint inline — se for o caso, gerar migration manual: `ALTER TABLE approvals DROP CONSTRAINT approvals_task_run_id_fkey, ADD CONSTRAINT approvals_task_run_id_fkey FOREIGN KEY (task_run_id) REFERENCES task_runs(id) ON DELETE CASCADE`. Mesma coisa pro agentId.
3. Como rows antigas em `approvals` (se existirem) não têm os novos campos, manter `payload` como fallback. Code novo escreve em `toolName`/`toolInput`/`suspendedMessages` e ignora `payload`. Inspecionar rows antigas após deploy — provável que tabela esteja vazia (caminho de aprovação nunca completou na prática).

### `apps/server/src/runtime/tool-gateway.ts` (novo)

Substitui `apps/server/src/tools/ads-gateway.ts`. Generaliza pra cross-agent:

```ts
import { config } from "../config.js"

type Classification = { level: "free" | "guarded"; reason?: string }

const GUARDED_OPS: Record<string, (input: Record<string, unknown>) => Classification> = {
  activateCampaign: () => ({
    level: "guarded",
    reason: "Ativar campanha gasta dinheiro real no Meta Ads",
  }),
  updateBudget: (input) => {
    const newDailyBudget = input.newDailyBudget as number | undefined
    const currentDailyBudget = input.currentDailyBudget as number | undefined
    if (
      newDailyBudget !== undefined &&
      currentDailyBudget !== undefined &&
      newDailyBudget > currentDailyBudget
    ) {
      return { level: "guarded", reason: "Aumento de orçamento gasta mais dinheiro real no Meta Ads" }
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
  // copia da implementação existente em ads-gateway.ts
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

`apps/server/src/tools/ads-gateway.ts` é deletado. `apps/server/src/tools/ads.ts` importa de `runtime/tool-gateway.ts`.

### `apps/server/src/tools/ads.ts`

Remove `guardedResponse` e o early-return em `activateCampaign` — a tool agora **executa de verdade**:

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

`updateBudget` mantém a checagem `validateBudgetLimit` (cap absoluto), mas sem `guardedResponse` no caminho de aumento — gateway no executor cuida disso. Mantém o "REQUER APROVAÇÃO HUMANA" no description (`seed.ts:235, 257`) pro modelo entender.

### `apps/server/src/runtime/executor.ts` — interrupt

**Bedrock requer 1:1** entre `toolUse` blocks num turn assistant e `toolResult` blocks no próximo turn user. Não dá só executar algumas tools e ignorar outras — o próximo `Converse` quebra com erro de schema.

**Estratégia:** ANTES de entrar no for-loop de tools, varrer todos os `toolUseBlocks`. Se **qualquer** for guarded, suspende **o turn inteiro**, sem executar nenhuma. Se nenhuma for guarded, executa o for normal.

```ts
import { classifyToolCall } from "./tool-gateway.js"
import { approvals } from "../db/schema.js"

// dentro do runAgenticLoop, depois de extrair toolUseBlocks e antes do for normal:
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
    classification.reason ?? "Aprovação requerida",
    { toolName: guardedTool.name, toolInput: guardedTool.input }
  )

  await updateAgentStatus(agent.id, "awaiting_approval")
  return  // sai do runAgenticLoop sem completar taskRun
}

// caminho normal: executa o for de toolUseBlocks como antes
```

**Nota:** os `toolUseId`s das outras tools do mesmo turn não precisam ser persistidos separadamente — já estão no `suspendedMessages` (assistant message contém todos os `toolUse` blocks). O `resumeAfterApproval` reconstrói a lista a partir daí.

**Ao retomar (`resumeAfterApproval`)** — detalhado no próximo bloco:
- Aprovado: executa só a guarded com `approval.toolInput`; outras `toolUseId`s recebem placeholder
- Rejeitado: tool guarded recebe `"Rejected by user."`; outras recebem placeholder
- Ambos casos: turn user tem N tool_results (1 pra cada toolUseId do turn anterior)

### `apps/server/src/runtime/executor.ts` — `resumeAfterApproval`

Reescreve: hoje lê `taskRuns.input as Message[]`, mas `input` guarda só `{ context }`. Lê de `approvals.suspendedMessages` agora.

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

  // resolve toolUseId da tool que vai ser aprovada/rejeitada
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

  // monta tool_result pra todos os toolUseIds do turn anterior (Bedrock requer 1:1)
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
        content: [{ text: "Operação cancelada pela suspensão. Refaça em turn separado se necessário." }],
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

**Garantia chave:** quando aprovado, o **harness** chama a tool com `approval.toolInput` (não o modelo). Isso impede o modelo de modificar parâmetros entre suspend e resume.

### `apps/server/src/routes/approvals.ts`

Atualiza pra passar `approval.id` em vez de `approval.taskRunId`:

```ts
await resumeAfterApproval(approval.id, action)
```

E emite evento `approval_decided` pra invalidar query no front:

```ts
eventBus.emit("agentEvent", {
  agentId: approval.agentId,
  taskRunId: approval.taskRunId,
  type: "approval_decided",
  content: action === "approve" ? "Aprovado" : "Rejeitado",
  metadata: { approvalId: approval.id, toolName: approval.toolName },
})
```

### `packages/shared` — types

Adiciona ao `AgentEventType`:
- `"approval_requested"`
- `"approval_decided"`

Adiciona aos status válidos do agent: `"awaiting_approval"`. Adiciona aos status de taskRun: `"awaiting_approval"`.

### `apps/server/src/db/seed.ts` — system prompt do Ads

Linhas 669-670 hoje:
```
- Ativação de campanhas (activateCampaign) REQUER aprovação humana — informe o usuário
- Aumento de orçamento (updateBudget quando novo > atual) REQUER aprovação humana
```

Atualizar pra:
```
- Você pode chamar activateCampaign diretamente — o sistema pausará automaticamente até o humano aprovar via UI
- Você pode chamar updateBudget diretamente — aumentos de orçamento serão pausados automaticamente até aprovação humana via UI
```

Senão o agent vai continuar avisando textualmente antes de chamar e o fluxo fica duplicado.

### Frontend

#### `apps/web/lib/queries/approval-queries.ts` (novo)

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

#### `apps/web/lib/components/approvals-panel.tsx` (novo)

Sheet (shadcn) deslizante pela direita com lista de pendentes. Cada item: nome do agent, nome da tool, JSON input formatado, botões aprovar/rejeitar. ~80 linhas.

#### `apps/web/lib/components/status-bar.tsx`

Adiciona badge âmbar com count quando `approvals.length > 0`, clica abre o painel:

```tsx
{approvals.length > 0 && (
  <button
    onClick={() => setPanelOpen(true)}
    className="px-2 py-1 rounded bg-amber-500/20 text-amber-700 text-xs font-semibold hover:bg-amber-500/30"
  >
    {approvals.length} aprovação{approvals.length > 1 ? "ões" : ""} pendente
  </button>
)}
<ApprovalsPanel open={panelOpen} onOpenChange={setPanelOpen} />
```

#### `apps/web/lib/stores/ws-store.ts`

Quando chega evento `approval_requested` ou `approval_decided`, invalida `["approvals"]` no QueryClient.

## Fluxo end-to-end (PR2)

```
1. Cron 02:00 dispara Ads agent
2. Agent analisa → decide ativar campanha
3. Tool call activateCampaign({ campaignId: "X" })
4. Harness: classifyToolCall → guarded
5. Harness:
   - INSERT approvals (status=pending, suspendedMessages=snapshot)
   - UPDATE taskRuns SET status='awaiting_approval'
   - emit approval_requested event
   - agent status = awaiting_approval
   - return (loop encerra)
6. Frontend: WS recebe approval_requested → invalida query
7. Status bar: "1 aprovação pendente" (badge âmbar)
8. Marcus clica → Sheet abre → vê tool + input
9. Aprova → POST /api/approvals/:id action=approve
10. Backend:
    - UPDATE approvals SET status='approved'
    - resumeAfterApproval(approval.id, 'approve')
    - executeTool('activateCampaign', toolInput salvo) → MCP → Meta API
    - injeta tool_result com sucesso
    - runAgenticLoop continua
11. Modelo recebe tool_result, completa o turn ("Campanha X ativada com sucesso")
12. taskRun status = completed
13. Frontend: WS approval_decided → invalida query → badge some
```

## Validação manual em produção

Sem testes automatizados (escolha confirmada — projeto não tem framework). Validação 100% manual após cada deploy:

**Após PR1:**
1. Disparar agent manualmente via UI → checar logs do server pra `cacheReadInputTokens`. Primeira chamada da sessão: cacheRead=0, cacheWrite>0. Segunda: cacheRead>0.
2. Forçar throttle: rodar 5 cron triggers em paralelo via `pnpm db:seed` + manual triggers. Olhar logs por `Retry attempt` (adicionar log nessa hora).
3. Step cap: dar pro agent uma tarefa propositalmente impossível ("itere essa lista vazia até completar") e verificar que para em 25 steps.

**Após PR2:**
1. Disparar Ads agent manualmente com prompt "Ative a campanha {id da campanha de teste}".
2. Verificar: badge "1 pendente" aparece, Sheet mostra tool/input, taskRun status awaiting_approval.
3. Aprovar → verificar Meta Ads Manager → campanha ACTIVE.
4. Verificar agent retoma e termina o turn com mensagem de confirmação.
5. Repetir com rejeitar — verificar que campanha fica PAUSED e agent responde corretamente.

## Risk register

| Risco | Mitigação |
|---|---|
| Step cap muito baixo (25) | Configurável via env `MAX_AGENT_STEPS`. |
| Retries causam duplo-trigger | Bedrock Converse é stateless — retry é seguro. |
| Cache miss inesperado | `cacheReadInputTokens=0` aparece nos logs/usage; debug rápido. |
| Tool input modificado entre suspend e resume | Mitigado: `executeTool` no resume usa `approval.toolInput` salvo, não input do modelo. |
| Approval órfã (taskRun deletado) | Schema atual **não tem** cascade. Migration adiciona `onDelete: cascade` em `taskRunId` e `agentId`. |
| Frontend painel não atualiza | Fallback `refetchInterval: 30s` + WS invalidate em `approval_*`. |
| Múltiplas tools no mesmo turn com 1 guarded | Pausa o turn inteiro, salva `pendingToolUseIds` e injeta tool_results placeholder ao retomar (Bedrock requer 1:1 toolUse↔toolResult). |
| Race em `approvals` (decisão dupla simultânea) | `routes/approvals.ts` já checa `status !== 'pending'` antes de decidir. |
| Migration trava deploy | Aditiva e nullable — runs em flight ok. |

## Deploy

**PR1:**
- Sem schema, sem deps. Build + pm2 restart padrão.
- Validação imediata: log do primeiro cron mostra `cacheReadInputTokens` no segundo run.

**PR2:**
- Roda migration: `pnpm db:generate && pnpm db:migrate` no deploy
- Build + pm2 restart
- Re-roda seed (system prompt do Ads atualizado): `pnpm db:seed`
- Validação manual conforme acima

## Não-objetivos (explícitos)

- Não introduzir framework de testes (decisão de Marcus em 2026-05-01)
- Não estender guarded list pra postTweet/updatePromoConfig/price tests (autonomia first)
- Não refatorar o tool-executor pra registry pattern
- Não adicionar extended thinking, streaming, AbortSignal, pgvector
- Não alterar lógica de cron / scheduler / meeting engine
