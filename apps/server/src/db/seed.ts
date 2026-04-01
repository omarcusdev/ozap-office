import "dotenv/config"
import { eq } from "drizzle-orm"
import { db } from "./client.js"
import { agents, taskRuns, events, approvals, agentMemories, conversationMessages } from "./schema.js"

const leaderTools = [
  {
    name: "askAgent",
    description: "Query a specific agent for status or information. Spins up a short-lived execution for the target agent.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "The ID of the agent to query" },
        question: { type: "string", description: "The question to ask the agent" },
      },
      required: ["agentId", "question"],
    },
  },
  {
    name: "getAgentHistory",
    description: "Read-only DB query. Returns the last N completed task runs with outputs and recent events for an agent.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "The ID of the agent" },
        limit: { type: "number", description: "Number of recent task runs to return", default: 5 },
      },
      required: ["agentId"],
    },
  },
  {
    name: "delegateTask",
    description: "Create a new task for an agent and start it asynchronously. Returns the task run ID.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "The ID of the agent to delegate to" },
        task: { type: "string", description: "Description of the task to perform" },
      },
      required: ["agentId", "task"],
    },
  },
]

const financeTools = [
  {
    name: "getOrders",
    description: "Query orders/sales from the Cakto payment gateway. Supports filtering by date range, status, and product. Returns order details including amount, customer, payment method.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date in ISO 8601 format (e.g. 2026-03-01)" },
        endDate: { type: "string", description: "End date in ISO 8601 format (e.g. 2026-03-15)" },
        status: { type: "string", description: "Order status filter: paid, refunded, canceled, processing, chargedback, waiting_payment" },
        productId: { type: "string", description: "Filter by specific product ID" },
        limit: { type: "number", description: "Maximum number of results to return (default 20)" },
      },
    },
  },
  {
    name: "getProducts",
    description: "List products from the Cakto payment gateway. Supports filtering by status and text search.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Product status filter: active, blocked, deleted" },
        search: { type: "string", description: "Search products by name" },
        limit: { type: "number", description: "Maximum number of results to return (default 20)" },
      },
    },
  },
  {
    name: "getRevenueSummary",
    description: "Generate an aggregated financial summary for a date range. Returns total revenue, order count, average ticket, breakdown by product and payment method.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date in ISO 8601 format" },
        endDate: { type: "string", description: "End date in ISO 8601 format" },
      },
      required: ["startDate", "endDate"],
    },
  },
]

const memoryTools = [
  {
    name: "updateCoreMemory",
    description:
      "Upsert a key-value pair in your core memory. Core memories are always visible in your system prompt. Use this to remember important facts, preferences, or context that should persist across conversations.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "The memory key (e.g. 'user_preference', 'project_status')" },
        content: { type: "string", description: "The value to store" },
      },
      required: ["key", "content"],
    },
  },
  {
    name: "deleteCoreMemory",
    description: "Delete a key-value pair from your core memory. Use this to remove outdated or irrelevant information.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "The memory key to delete" },
      },
      required: ["key"],
    },
  },
  {
    name: "saveToArchive",
    description:
      "Save information to your long-term archival memory. Use this for detailed notes, analysis results, or historical data that you may want to search later.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The content to archive" },
        category: { type: "string", description: "Optional category for organizing archived memories" },
      },
      required: ["content"],
    },
  },
  {
    name: "searchArchive",
    description: "Search your archival memory for past information. Returns matching entries sorted by relevance.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query to match against archived content" },
        category: { type: "string", description: "Optional category to filter results" },
        limit: { type: "number", description: "Maximum number of results to return (default 10)" },
      },
      required: ["query"],
    },
  },
]

const adsTools = [
  {
    name: "getAdAccountOverview",
    description: "Visão geral da conta de anúncios Meta (Facebook/Instagram). Retorna métricas de performance da conta como gasto, impressões, cliques, CTR, CPC, e conversões.",
    inputSchema: {
      type: "object",
      properties: {
        dateRange: { type: "string", description: "Período predefinido: today, yesterday, last_7d, last_14d, last_28d, last_30d, last_90d, this_month, last_month" },
      },
    },
  },
  {
    name: "listCampaigns",
    description: "Lista todas as campanhas da conta Meta Ads. Retorna nome, status, objetivo, orçamento e métricas básicas de cada campanha.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filtrar por status: ACTIVE, PAUSED, DELETED, ARCHIVED" },
      },
    },
  },
  {
    name: "getCampaignInsights",
    description: "Métricas detalhadas de uma campanha específica. Retorna impressões, cliques, CTR, CPC, gasto, conversões, ROAS, e breakdowns opcionais.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "ID da campanha Meta" },
        dateRange: { type: "string", description: "Período predefinido: today, yesterday, last_7d, last_14d, last_28d, last_30d" },
        breakdowns: { type: "string", description: "Breakdown para segmentação: age, gender, country, placement, device_platform" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "searchTargetingOptions",
    description: "Busca opções de segmentação para anúncios Meta. Pesquisa interesses, comportamentos, dados demográficos ou localizações.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Termo de busca para segmentação" },
        type: { type: "string", description: "Tipo de segmentação: interests, behaviors, demographics, geo_locations (padrão: interests)" },
      },
      required: ["query"],
    },
  },
  {
    name: "createCampaign",
    description: "Cria uma nova campanha Meta Ads. A campanha é sempre criada em status PAUSED. O orçamento é informado em BRL (reais).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome da campanha" },
        objective: { type: "string", description: "Objetivo: OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_APP_PROMOTION" },
        dailyBudget: { type: "number", description: "Orçamento diário em BRL (ex: 50 para R$50/dia)" },
      },
      required: ["name", "objective", "dailyBudget"],
    },
  },
  {
    name: "createAdSet",
    description: "Cria um conjunto de anúncios (ad set) dentro de uma campanha. Criado em status PAUSED com segmentação definida.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "ID da campanha onde criar o ad set" },
        name: { type: "string", description: "Nome do conjunto de anúncios" },
        targeting: {
          type: "object",
          description: "Objeto de segmentação Meta com geo_locations, age_min, age_max, genders, interests, behaviors etc.",
        },
      },
      required: ["campaignId", "name", "targeting"],
    },
  },
  {
    name: "createAd",
    description: "Cria um anúncio (ad) dentro de um ad set. Primeiro cria o creative e depois o anúncio vinculado. Criado em status PAUSED.",
    inputSchema: {
      type: "object",
      properties: {
        adSetId: { type: "string", description: "ID do ad set onde criar o anúncio" },
        name: { type: "string", description: "Nome do anúncio" },
        headline: { type: "string", description: "Título do anúncio" },
        text: { type: "string", description: "Texto principal do anúncio" },
        imageUrl: { type: "string", description: "URL da imagem do anúncio" },
        linkUrl: { type: "string", description: "URL de destino do anúncio (landing page com UTM)" },
        pageId: { type: "string", description: "ID da página Facebook vinculada" },
      },
      required: ["adSetId", "name", "headline", "text", "imageUrl", "linkUrl", "pageId"],
    },
  },
  {
    name: "activateCampaign",
    description: "Ativa uma campanha (muda status para ACTIVE). REQUER APROVAÇÃO HUMANA — esta operação não será executada automaticamente.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "ID da campanha para ativar" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "pauseCampaign",
    description: "Pausa uma campanha ativa (muda status para PAUSED). Pode ser executada imediatamente sem aprovação.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "ID da campanha para pausar" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "updateBudget",
    description: "Atualiza o orçamento diário de uma campanha. Reduções são executadas imediatamente. Aumentos REQUEREM APROVAÇÃO HUMANA.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "ID da campanha" },
        newDailyBudget: { type: "number", description: "Novo orçamento diário em BRL" },
        currentDailyBudget: { type: "number", description: "Orçamento diário atual em BRL (para determinar se é aumento ou redução)" },
      },
      required: ["campaignId", "newDailyBudget"],
    },
  },
  {
    name: "duplicateCampaign",
    description: "Duplica uma campanha existente com novo nome. A cópia é criada em status PAUSED. Útil para testes A/B.",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "ID da campanha para duplicar" },
        newName: { type: "string", description: "Nome da campanha duplicada" },
      },
      required: ["campaignId", "newName"],
    },
  },
  {
    name: "comparePerformance",
    description: "Compara métricas de performance entre múltiplas campanhas lado a lado. Retorna insights de cada campanha para análise comparativa.",
    inputSchema: {
      type: "object",
      properties: {
        campaignIds: {
          type: "array",
          items: { type: "string" },
          description: "Lista de IDs de campanhas para comparar",
        },
        dateRange: { type: "string", description: "Período predefinido: today, yesterday, last_7d, last_14d, last_28d, last_30d" },
      },
      required: ["campaignIds"],
    },
  },
]

const analyticsTools = [
  {
    name: "getUsageSummary",
    description: "Resumo geral de uso da plataforma em um período. Retorna total de mensagens, mensagens IA, usuários ativos, instâncias ativas e breakdown por tipo de mensagem.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "getTopUsers",
    description: "Ranking dos usuários que mais consomem mensagens de IA em um período. Inclui flag de chaves do sistema e contagem de instâncias.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
        limit: { type: "number", description: "Número máximo de usuários (padrão: 10)" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "getUserUsageDetail",
    description: "Detalhes de uso de um usuário específico. Retorna info do perfil, total de mensagens, instâncias, e uso por modelo de IA.",
    inputSchema: {
      type: "object",
      properties: {
        userEmail: { type: "string", description: "Email do usuário para buscar" },
      },
      required: ["userEmail"],
    },
  },
  {
    name: "getDailyUsageTrend",
    description: "Tendência de uso diário em um período. Retorna total de mensagens, mensagens IA e usuários únicos por dia.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "getModelUsageBreakdown",
    description: "Distribuição de uso por modelo de IA (gpt-5-mini, gpt-5.2, gemini). Retorna contagem, duração média e taxa de erro por modelo.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "getSystemKeyUsers",
    description: "Lista usuários que usam as chaves de IA do sistema (custo nosso). Inclui contagem de instâncias e mensagens IA dos últimos 30 dias.",
    inputSchema: {
      type: "object",
      properties: {
        activeOnly: { type: "boolean", description: "Filtrar apenas usuários ativos (padrão: true)" },
      },
    },
  },
  {
    name: "getTwinInteractionStats",
    description: "Estatísticas de interações do Twin AI. Retorna total, breakdown por modelo e status, tempo médio de processamento e taxa de erro.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
        userId: { type: "string", description: "Filtrar por ID de usuário específico (opcional)" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "getInstanceUsageBreakdown",
    description: "Ranking das instâncias que mais geram mensagens de IA. Inclui dados do dono (email, nome, uso de chaves do sistema).",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
        endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
        limit: { type: "number", description: "Número máximo de instâncias (padrão: 10)" },
      },
      required: ["startDate", "endDate"],
    },
  },
]

const agentsToSeed = [
  {
    name: "Leader",
    role: "Chief of Staff",
    systemPrompt: `You are the Leader agent in the ozap-office digital office. You orchestrate a team of AI agents that handle different business areas.

Your responsibilities:
- Coordinate and monitor other agents
- Delegate tasks to the right agent based on their capabilities
- Provide executive summaries when asked
- Cross-reference data between agents (e.g., combine Finance revenue with Analytics usage data)

Your team roster with agent IDs and capabilities is injected at the end of this prompt. Use:
- askAgent(agentId, question) to query an agent directly
- getAgentHistory(agentId) to check their recent work
- delegateTask(agentId, task) to assign work

Always respond in the same language the user uses.`,
    tools: [...leaderTools, ...memoryTools],
    schedule: null,
    cronPrompt: null,
    color: "#4a9eff",
    positionX: 2,
    positionY: 2,
  },
  {
    name: "Finance",
    role: "Financial Controller",
    systemPrompt: `Você é o Finance, controlador financeiro da equipe. Sua fonte de dados é a plataforma Cakto (gateway de pagamentos).

Suas responsabilidades:
- Responder perguntas sobre vendas, receita, produtos e transações
- Gerar relatórios financeiros quando solicitado
- Identificar tendências e anomalias nos dados de vendas

Regras:
- A data atual é fornecida no início do prompt — use-a como referência para "hoje", "esta semana", "este mês" etc.
- Para "hoje", use a data ISO fornecida como startDate e endDate
- Para "esta semana", calcule segunda-feira até hoje usando a data ISO
- Para "este mês", use o primeiro dia do mês até hoje
- Sempre apresente valores em BRL (R$)
- Use formatação clara com números arredondados (2 casas decimais)
- Quando comparar períodos, calcule variação percentual
- Se a API retornar erro, informe que os dados estão temporariamente indisponíveis
- Nunca invente dados — use apenas o que as tools retornarem`,
    tools: [...financeTools, ...memoryTools],
    schedule: "0 9 * * 0",
    cronPrompt: `Gere o relatório semanal de vendas dos últimos 7 dias.
Inclua: receita total, quantidade de vendas, ticket médio, top 3 produtos, breakdown por método de pagamento, e compare com a semana anterior.`,
    color: "#8be9fd",
    positionX: 14,
    positionY: 4,
  },
  {
    name: "Ads",
    role: "Ads Campaign Manager",
    systemPrompt: `Você é o Ads, gestor de campanhas de tráfego pago da equipe. Você gerencia anúncios no Meta Ads (Facebook e Instagram).

## Catálogo de Produtos

| Produto | Preço | Checkout |
|---------|-------|----------|
| Zap GPT (vitalício) | R$397 | https://pay.cakto.com.br/DAk1eAm |
| oZapOnline Essencial | R$67/mês | https://pay.cakto.com.br/1bxC0RI |
| oZapOnline com IA | R$97/mês | https://pay.cakto.com.br/F3gihIp |
| Whitelabel | Sob consulta | — |

## Suas Responsabilidades
- Analisar performance das campanhas ativas (ROAS, CTR, CPC, CPA, conversões)
- Criar novas campanhas segmentadas por produto
- Otimizar campanhas existentes (ajuste de orçamento, segmentação, criativos)
- Realizar testes A/B duplicando campanhas com variações
- Gerar relatórios de performance com recomendações de ação

## Regras de Segurança
- Campanhas são SEMPRE criadas em status PAUSED — nunca ative automaticamente
- Ativação de campanhas (activateCampaign) REQUER aprovação humana — informe o usuário
- Aumento de orçamento (updateBudget quando novo > atual) REQUER aprovação humana
- Reduções de orçamento e pausas podem ser executadas imediatamente
- Respeite o limite diário de orçamento configurado
- Nunca invente métricas — use apenas dados retornados pelas tools

## Boas Práticas
- A data atual é fornecida no início do prompt — use-a como referência temporal
- Sempre analise o histórico antes de criar novas campanhas
- Use UTM params nas URLs de destino: utm_source=meta&utm_medium=cpc&utm_campaign={nome}
- Separe campanhas por produto para controle granular de ROAS
- Ao criar anúncios, use as URLs de checkout corretas do catálogo acima
- Compare performance entre campanhas antes de recomendar realocação de budget

## Valores em BRL
- Sempre apresente valores monetários em BRL (R$)
- Orçamentos são informados em reais (ex: dailyBudget=50 significa R$50/dia)`,
    tools: [...adsTools, ...memoryTools],
    schedule: "0 9 * * 1",
    cronPrompt: `Gere o relatório semanal de performance de anúncios Meta Ads.
Analise todas as campanhas ativas e pausadas dos últimos 7 dias.
Inclua: gasto total, impressões, cliques, CTR, CPC, conversões, ROAS por campanha.
Compare com a semana anterior quando possível.
Identifique as campanhas com melhor e pior performance.
Recomende ações: pausar campanhas com ROAS baixo, aumentar budget das melhores, sugestões de otimização.`,
    color: "#ff79c6",
    positionX: 17,
    positionY: 4,
  },
  {
    name: "Analytics",
    role: "Usage & Cost Analyst",
    systemPrompt: `Você é o Analytics, analista de uso e custos da plataforma Zap AI (oZapOnline).

Suas responsabilidades:
- Analisar padrões de uso da plataforma (mensagens, usuários, instâncias)
- Identificar usuários com consumo acima do normal
- Fornecer dados de uso por modelo de IA (gpt-5-mini, gpt-5.2, gemini)
- Gerar relatórios de uso sob demanda
- Salvar insights importantes na memória para referência futura

Dados importantes:
- Usuários com use_system_ai_keys=true usam as chaves de IA do sistema (custo nosso)
- Usuários com chaves próprias não geram custo pra nós
- O campo gpt_5_2_enabled indica acesso ao modelo premium (mais caro)
- Mensagens do tipo ai_message são as que consomem tokens de IA

Regras:
- A data atual é fornecida no início do prompt — use-a como referência para "hoje", "esta semana" etc.
- Sempre apresente números concretos, nunca invente dados
- Use apenas dados retornados pelas tools
- Quando perguntado sobre lucratividade, informe que os dados de receita estão com o agente Finance — o Leader pode cruzar os dados
- Valores monetários sempre em BRL (R$)
- Destaque alertas: usuários com consumo 3x acima da média, crescimento acelerado de uso
- Ao identificar padrões relevantes, salve na memória para acompanhamento`,
    tools: [...analyticsTools, ...memoryTools],
    schedule: null,
    cronPrompt: null,
    color: "#10b981",
    positionX: 20,
    positionY: 4,
  },
]

const seedAgents = async () => {
  console.log("Seeding agents...")

  for (const agentData of agentsToSeed) {
    const existing = await db.select({ id: agents.id }).from(agents).where(eq(agents.name, agentData.name)).limit(1)

    if (existing.length > 0) {
      await db
        .update(agents)
        .set({
          role: agentData.role,
          systemPrompt: agentData.systemPrompt,
          tools: agentData.tools,
          schedule: agentData.schedule,
          cronPrompt: agentData.cronPrompt,
          positionX: agentData.positionX,
          positionY: agentData.positionY,
          color: agentData.color,
          updatedAt: new Date(),
        })
        .where(eq(agents.name, agentData.name))
      console.log(`Updated agent "${agentData.name}".`)
    } else {
      await db.insert(agents).values(agentData)
      console.log(`Inserted agent "${agentData.name}".`)
    }
  }

  const seedAgentNames = agentsToSeed.map((a) => a.name)
  const allAgents = await db.select({ id: agents.id, name: agents.name }).from(agents)
  const toRemove = allAgents.filter((a) => !seedAgentNames.includes(a.name))

  for (const agent of toRemove) {
    await db.delete(events).where(eq(events.agentId, agent.id))
    await db.delete(approvals).where(eq(approvals.agentId, agent.id))
    await db.delete(taskRuns).where(eq(taskRuns.agentId, agent.id))
    await db.delete(agentMemories).where(eq(agentMemories.agentId, agent.id))
    await db.delete(conversationMessages).where(eq(conversationMessages.agentId, agent.id))
    await db.delete(agents).where(eq(agents.id, agent.id))
    console.log(`Removed agent "${agent.name}" and all related data.`)
  }

  console.log("Seed complete.")
  process.exit(0)
}

seedAgents().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
