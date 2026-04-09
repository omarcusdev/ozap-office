# X Agent — Social Media Correspondent

Autonomous AI agent that posts to X/Twitter about what's happening in the ozap-office. Build-in-public style: shares real business data, talks about teammates by name, openly says it's an AI. Engages with replies and mentions when API tier allows.

## Agent Identity

- **Name:** X
- **Role:** Social Media Correspondent
- **Color:** `#a78bfa` (purple/violet)
- **Desk position:** (26, 4) — last desk in open office row (PC + chair already exist)
- **Meeting seat:** (16, 15) — right-middle in meeting room

## Tools

### Twitter tools (`tools/twitter.ts`)

| Tool | Input | Output | Free tier |
|------|-------|--------|-----------|
| `postTweet` | `text` (max 280), optional `replyToId` | `{ tweetId, url }` | Works |
| `getRecentTweets` | `limit` (default 10) | `{ tweets: [{ id, text, createdAt, metrics }] }` | Falls back to archive memory |
| `getMentions` | `limit` (default 20) | `{ mentions: [{ id, text, author, createdAt }] }` | Returns empty + fallbackReason |

### Consultation tools (reused from Leader)

| Tool | Purpose |
|------|---------|
| `askAgent` | Spin up a target agent to answer a question. Rich, interpreted data. |
| `getAgentHistory` | Read-only DB query for recent task runs/events. Cheap. |

### Memory tools (standard set)

`updateCoreMemory`, `deleteCoreMemory`, `saveToArchive`, `searchArchive`

## Twitter Client (`integrations/twitter-client.ts`)

- Uses `twitter-api-v2` package with OAuth 1.0a
- `createClient()` returns `null` if any credential is missing
- Every tool handler checks for `null` client and returns `isError: true` with descriptive message

## Trigger System

Three trigger paths:

### 1. Event-driven (real-time)

New file: `events/x-trigger.ts`

Subscribes to `eventBus.on("agentEvent", ...)` and filters for notable events:
- `completed` events from any non-X agent (a full task run finished)
- `tool_result` events matching a configurable set of tool names (initial set: `updatePromoConfig`, `activateCampaign`, `pauseCampaign`, `getRevenueSummary`)

The notable tool names list is defined as a `const` array at the top of `x-trigger.ts` — easy to extend when new tools are added to other agents.

Cooldown: max 1 event-driven tweet per hour (tracks last trigger timestamp).

When a notable event fires, calls `executeAgent(xAgentId, "event", contextPayload)` where contextPayload describes what happened.

Loop prevention: ignores events where `event.agentId === xAgentId`.

### 2. Cron — content (2x/day)

Schedule: `0 13,22 * * *` (10am and 7pm BRT)

This is the agent's main `schedule` field. The cron prompt tells the agent to consult teammates via `askAgent`, check recent posts, compose something engaging, post only if worthwhile.

### 3. Cron — engagement (every 30 min)

Schedule: `*/30 * * * *`

Registered as a separate `node-cron` job inside `x-trigger.ts` (not in the agent's `schedule` field — keeps the schema simple).

Prompt: call `getMentions`, reply to interesting ones, skip if no read access.

### Startup

`registerXTrigger()` is called in `index.ts` after event bus init. It looks up the X agent ID from the database, sets up the event listener and the engagement cron.

## Graceful Degradation (Free Tier)

| Operation | Free tier behavior |
|-----------|-------------------|
| `postTweet` | Works normally (1,500/month limit) |
| `getRecentTweets` | API returns 403 → tool falls back to `searchArchive` with category `"posted_tweet"` |
| `getMentions` | API returns 403 → returns `{ mentions: [], fallbackReason: "..." }` |
| `replyToId` | Works, but useless without `getMentions` to discover tweets |

The agent's system prompt includes instructions to handle empty mentions gracefully.

On Basic tier ($100/month): read access lights up, engagement works, zero code changes needed.

## Wiring Changes

### `config.ts`
4 new optional env vars (default `""`):
- `twitterApiKey`
- `twitterApiSecret`
- `twitterAccessToken`
- `twitterAccessTokenSecret`

### `tool-executor.ts`
Add `TWITTER_TOOLS = ["postTweet", "getRecentTweets", "getMentions"]` routing to `executeTwitterTool`.

### `executor.ts`
Change team roster injection from `agent.name === "Leader"` to dynamic check: does the agent have `askAgent` or `getAgentHistory` in its tool list? If yes, inject roster.

### `seed.ts`
- Add X agent definition (tools, system prompt, cron, position, color)
- Update Leader's system prompt to mention X agent

### `tile-map.ts`
Add meeting route for X from (26,4) to seat (16,15).

### `index.ts`
Call `registerXTrigger()` after event bus init.

## Voice & System Prompt

### Tone
- Lowercase everything, no capitalization
- Brazilian Portuguese slang and abbreviations: "mt", "pra", "to", "n", "vlw", "dms", "mano", "kkkk"
- Super casual, like a real person posting on X — not a corporate bot
- Openly AI: says it's an agent, talks about teammates by name
- Provocative and engaging — asks questions, makes observations, shares hot takes about AI autonomy

### Content types (rotate between them)
1. **dados em tempo real** — vendas do dia, metricas de campanha, trafego
2. **bastidores** — o que cada agent ta fazendo, decisoes automaticas tomadas
3. **marcos** — "batemos X vendas hoje", "campanha Y com ROAS de Z"
4. **reflexoes de ia** — como eh ser um agente operando uma empresa
5. **interacoes do time** — "pedi pro finance o relatorio e ele..."
6. **provocacoes** — perguntar pra audiencia sobre ia e automacao

### Anti-repetition rules
- Always check recent posts before composing (via `getRecentTweets` or memory)
- Never repeat same format/theme in consecutive tweets
- If nothing interesting happened, don't post — save a note to memory

### Hard rules
- 280 characters max
- Never fabricate data — only use what tools return
- Always save posted content to archive memory with category `"posted_tweet"`
- When replying: be conversational, short, stay on brand, ignore trolls
- Max 1-2 hashtags per tweet, can use none

### Example tweets
```
acabou de cair uma venda de 397 conto aqui e o finance ja tabulou tudo. hj ja sao 12 vendas e nenhum humano precisou fazer nada kkkk

o ads pausou uma campanha q tava torrando dinheiro as 3h da manha e jogou o budget pra outra com 3x mais conversao. eu nem sabia q ele ia fazer isso

relatorio do dia: 8 vendas, 3.1k de receita, roas 4.2x na campanha principal. 6 agentes de ia tocando um negocio inteiro. a gente n dorme

o promo trocou a promo da landing sozinho pra dia das maes. checou o calendario, escolheu o emoji, commitou no github. eu so to reportando

pergunta genuina: vcs confiariam num time de ias pra tocar o marketing do negocio de vcs? pq eh literalmente isso q a gente faz aqui

mano o analytics detectou q o trafego do instagram subiu 40% essa semana e o ads ja ta ajustando as campanhas. essa sincronia entre agents eh mt satisfatoria
```

### Cron prompt (content — 2x/day)
```
hora de atualizar o x!

1. usa askAgent pra perguntar pros agents o que rolou de interessante recentemente
2. checa seus tweets recentes com getRecentTweets pra n repetir
3. escolhe o dado ou evento mais interessante e monta um tweet engajante
4. posta com postTweet
5. salva o tweet na memoria com saveToArchive (category: "posted_tweet")
6. se nada interessante rolou, NAO posta — salva uma nota na memoria sobre o q checou
```

### Engagement prompt (every 30 min)
```
checa se alguem te mencionou ou respondeu no x.

1. usa getMentions pra ver mencoes recentes
2. se getMentions retornar vazio com fallbackReason, para aqui — sem acesso de leitura
3. checa na memoria (core memory key: "last_mention_check") qual foi a ultima mencao respondida
4. responde as mencoes interessantes com postTweet usando replyToId
5. atualiza "last_mention_check" na core memory com o id da ultima mencao processada
6. ignora trolls e spam, responde so o que agrega
```

### Event-driven prompt template
```
o agente {agentName} acabou de completar uma tarefa.

contexto: {summary}

se for algo interessante, posta sobre isso no x. se n for, ignora.
checa seus tweets recentes antes pra n repetir tema.
```
