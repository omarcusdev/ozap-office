# Análise de Custo de IA vs Receita

**Data**: 2026-05-02
**Janela analisada**: últimos 30 dias
**Pergunta central**: as assinaturas (oZapOnline + Zap GPT legacy) estão gerando prejuízo por incluírem uso de IA?

---

## TL;DR

**Não, não estamos no negativo.** Margem agregada de **97%** sobre o custo de IA.

| | |
|---|---:|
| Receita total estimada | ~R$35.700/mês |
| Custo IA total | ~R$1.100/mês ($200 USD) |
| **Lucro líquido sobre IA** | **~R$34.600/mês** |
| % do custo IA sobre a receita | 3,1% |

A preocupação inicial não se confirma no agregado. Existem drenos pontuais (196 usuários gastam mais IA do que pagam), mas o impacto deles soma R$1.156/mês — facilmente absorvido pela base saudável.

---

## Metodologia

Script analítico em `apps/server/scripts/ai-cost-report.ts` cruza dois bancos:

- **ozaponline DB** (produto novo): `messages.message_type='ai_message'` + `instances.agent_id IS NOT NULL`
- **zap-auth DB** (produto legacy): `twin_ai_metrics` joinado com `users.device_id`

O custo de $200 USD (informado, fatura do provider) é distribuído proporcionalmente ao volume de eventos por usuário em cada produto.

### Como diferenciamos os produtos

- **oZapOnline** = usuário tem ao menos uma `instance` com `agent_id` preenchido (produto novo, web-based)
- **Legacy Zap GPT** = usuário existe na zap-auth DB, usa o desktop client antigo, posta métricas via `metricsLogger.js`

---

## Números por produto

| Produto | Users ativos | Subs | Vitalício | Usaram IA (30d) | Eventos/30d | Custo (R$) | Share |
|---|---:|---:|---:|---:|---:|---:|---:|
| **oZapOnline** | 43 | 42 | 1 | 38 | 184.870 | R$886 | **80,5%** |
| **Legacy Zap GPT** | 1.885 | 660 | 1.225 | 238 | 44.646 | R$214 | 19,5% |
| **Total** | **1.928** | **702** | **1.226** | **276** | **229.516** | **R$1.100** | 100% |

### Receita estimada

| Produto | Subs ativos | MRR/user (premissa) | Receita/mês |
|---|---:|---:|---:|
| oZapOnline | 42 | R$80 | R$3.360 |
| Legacy Zap GPT | 660 | R$49 | R$32.340 |
| **Total** | **702** | — | **R$35.700** |

> ⚠️ MRR médio é premissa. Não temos tabela de "plano por usuário" no DB — webhooks (Cakto/Hotmart/Kiwify) só atualizam `access_until`, sem persistir o produto. Para receita exata: cruzar emails com Cakto API.

---

## Drenos identificados (196 usuários)

Total de bleed: **R$1.156/mês**.

### Top 5 drenos

| Email | Produto | Plano | Custo/mês | Receita/mês | Net |
|---|---|---|---:|---:|---:|
| rbbrs1997@icloud.com | oZapOnline | sub | R$353 | R$80 | **-R$273** |
| joao.carnauba@hotmail.com | oZapOnline | sub | R$184 | R$80 | **-R$104** |
| m@m.com | oZapOnline | vitalício | R$60 | R$0 | -R$60 |
| doreagustavo@gmail.com | Legacy | vitalício | R$28 | R$0 | -R$28 |
| tamarasantos98oficial@gmail.com | oZapOnline | sub | R$100 | R$80 | -R$20 |

> `m@m.com` parece conta de teste interna — confirmar com time.

O resto da lista é cauda longa de Vitalícios legacy fazendo 200-2000 calls/mês (R$9-10/mês cada).

---

## Insights principais

### 1. Os 3 heavy users do oZapOnline geram 60% do custo IA total
- rbbrs1997: 73.677 mensagens/mês (R$353/mês de custo)
- joao.carnauba: 38.386 mensagens/mês (R$184)
- tamarasantos98: 20.904 mensagens/mês (R$100)
- **Juntos**: R$637 dos R$1.100 totais

### 2. oZapOnline custa 80% mas tem só 43 users ativos
Provavelmente porque o produto novo:
- Usa modelos mais pesados (PUREROUTER/OpenAI direto via servidor)
- Tem mais features que disparam chamadas (agentes, tools, conversation memory)

### 3. Legacy tá aposentado funcionalmente
- 1.885 users com acesso, só 238 (12,6%) usaram IA nos 30 dias
- Os outros 87% pagam (Vitalício uma vez, subs continuam) sem custar nada
- Engagement caiu, mas receita continua entrando — produto residual saudável

### 4. Engagement do oZapOnline é alto
- 38 de 43 users ativos (88%) usaram IA nos 30 dias
- 5 users pagam e não usam — pure profit, sem risco de churn por custo

### 5. A flag `use_system_ai_keys=true` está dessincronizada
Inicialmente apontou só 2 users, mas o cruzamento via `device_id` revelou 84 instâncias usando oZap AI no legacy. A flag é controle no app novo — não reflete o legacy desktop client (que sempre usa a chave do sistema).

---

## Limitações deste relatório

### 1. Tokens não são logados
`zap-gpt-client/src/core/whatsapp/ai/metricsLogger.js` (linhas 41-43) hardcoda:

```js
prompt_tokens: 0,
completion_tokens: 0,
total_tokens: 0,
```

Os providers (`openai.js`, `anthropic.js`, `google.js`, `dai.js`) chamam o logger passando só `aiProvider: 'GPT'` (ou GEMINI/CLAUDE) — não passam o objeto `usage` da response. Por isso `model_used` é genérico e tokens são sempre 0. **Não é bug — é design.** Mas impede cálculo de custo real por usuário.

### 2. MRR é estimativa
Sem tabela `product_tier` por usuário. Receita exata exige cruzar emails com Cakto/Hotmart/Kiwify.

### 3. Distribuição do $200 assume custo uniforme por evento
Cada evento (mensagem AI no oZapOnline ou call em twin_ai_metrics no legacy) é tratado como custando o mesmo. Não é verdade — oZapOnline usa modelos mais caros que `gpt-5-nano`. Provavelmente o share real do oZapOnline é >80,5%.

### 4. $200 informado pode incluir consumo não-cliente
ozap-office roda 5 agents Bedrock semanalmente — também consome IA. Se o $200 é fatura agregada, parte é custo interno.

---

## Recomendações

### Curto prazo (antes do próximo ciclo)
- **Plano enterprise** para os 3 heavy users (R$200-300/mês). Eles extraem muito valor; cobram pouco.
- **Cap de mensagens por plano** (ex: 30k/mês no R$80, depois sobretaxa). Protege margem de heavy users futuros.
- **Auditar `m@m.com`** — confirmar se é teste interno e desativar AI access se for.

### Médio prazo
- **Logar tokens reais** no `metricsLogger.js`: cada provider já tem `response.usage` — basta passar pra função.

  ```js
  // openai.js (e os outros)
  logAIInteraction({
    instanceId, chatId,
    aiProvider: 'GPT',
    modelUsed: response.model,
    promptTokens: response.usage.prompt_tokens,
    completionTokens: response.usage.completion_tokens,
    ...
  })
  ```

- **Persistir produto/plano no users** (coluna `product_tier`). Webhooks já têm essa info; só não tá sendo salvo no user.
- **Tool `getAiCostAnalysis` no Analytics agent** (ozap-office). Roda esse relatório semanalmente, sinaliza heavy users.

### Longo prazo
- **Sunset Legacy Zap GPT**: 1.225 Vitalícios (acesso eterno) e 660 subs num produto descontinuado. Decidir plano de migração ou cap de uso.

---

## Apêndice A: como rodar o relatório

```bash
ZAP_GPT_DATABASE_URL='postgresql://ozaponline:<senha>@ozaponline-db.c2zu4m4yoxb5.us-east-1.rds.amazonaws.com:5432/ozaponline?sslmode=no-verify' \
ZAP_AUTH_DATABASE_URL='postgresql://postgres:<senha>@zap-gpt-db.c2zu4m4yoxb5.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=no-verify' \
TOTAL_AI_COST_USD=200 \
USD_TO_BRL=5.5 \
ASSUMED_OZAPONLINE_MRR_BRL=80 \
ASSUMED_LEGACY_MRR_BRL=49 \
DAYS_WINDOW=30 \
pnpm tsx apps/server/scripts/ai-cost-report.ts
```

Variáveis ajustáveis (todas opcionais com defaults):
- `TOTAL_AI_COST_USD` — custo total da fatura do provider no período
- `USD_TO_BRL` — câmbio
- `ASSUMED_OZAPONLINE_MRR_BRL` — MRR médio assumido por user oZapOnline
- `ASSUMED_LEGACY_MRR_BRL` — MRR médio assumido por user legacy subscription
- `DAYS_WINDOW` — janela em dias

---

## Apêndice B: glossário das tabelas

### Banco `ozaponline` (RDS ozaponline-db)
- **users**: usuários do produto novo. Coluna chave: `id` (uuid), `email`, `access_until`, `has_ai_access`, `use_system_ai_keys`
- **instances**: conexões WhatsApp dos users. Coluna chave: `user_id`, `agent_id` (NULL = legacy mode)
- **messages**: histórico de mensagens. `message_type='ai_message'` = resposta gerada pela IA
- **twin_interactions**: log de interações via Twin Mode (subset, ~880 calls/30d apenas)
- **agents**: configurações de agentes IA do produto novo

### Banco `postgres` na RDS `zap-gpt-db`
- **users**: usuários do produto legacy. Coluna chave: `id`, `email`, `device_id`, `access_until`
- **twin_ai_metrics**: log de chamadas IA do desktop client. Coluna chave: `device_id` (junta com `users.device_id`), `model_used` (GPT/GEMINI/CLAUDE/twin-ai genérico), tokens (sempre 0)

---

*Documento gerado a partir do script `apps/server/scripts/ai-cost-report.ts` em 2026-05-02.*
