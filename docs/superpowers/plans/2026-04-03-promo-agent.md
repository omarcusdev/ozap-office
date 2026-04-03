# Promo Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully autonomous Promo agent to Ozap Office that manages seasonal promotions on the ZapGPT landing page via GitHub API commits.

**Architecture:** New agent with two tools (`getActivePromo`, `updatePromoConfig`) that read/write a static JSON config in the `zap-landing` repo. The LP imports this config at build time and renders a floating promo banner + adjusts pricing/links accordingly. No DB changes, no new API endpoints.

**Tech Stack:** TypeScript, Fastify (server), Next.js (LP), GitHub REST API, Vercel auto-deploy

**Repos:** `ozap-office` (agent + tools) and `zap-landing` (config + banner + pricing)

---

## Task 1: Add GITHUB_TOKEN to config

**Files:**
- Modify: `apps/server/src/config.ts`

- [ ] **Step 1: Add githubToken to config object**

```typescript
// In apps/server/src/config.ts, add to the config object:
githubToken: process.env.GITHUB_TOKEN ?? "",
```

Add it after the `zapGptDatabaseUrl` line.

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/config.ts
git commit -m "feat(promo): add GITHUB_TOKEN to server config"
```

---

## Task 2: Create promo tool module

**Files:**
- Create: `apps/server/src/tools/promo.ts`

- [ ] **Step 1: Create the tool handler**

```typescript
// apps/server/src/tools/promo.ts
import { config } from "../config.js"

type ToolResult = { content: string; isError?: boolean }

const GITHUB_REPO = "omarcusdev/zap-landing"
const CONFIG_PATH = "src/config/promo-config.json"
const API_BASE = `https://api.github.com/repos/${GITHUB_REPO}/contents/${CONFIG_PATH}`

const PROMO_DEFAULTS = {
  price: "R$197,00",
  priceOriginal: "R$497",
  installments: "12x de R$19,67",
  savings: "ECONOMIA DE R$ 300",
  pixLink: "https://app.abacatepay.com/pay/bill_ZM4Pm0PgHpjfWzPQ5eRthqjx",
  cardLink: "https://pay.cakto.com.br/39jee69",
  defaultPixLink: "https://app.abacatepay.com/pay/bill_yqqpmYHWQGT1D3yCXdxJZCMs",
  defaultCardLink: "https://pay.cakto.com.br/ijjptyj",
  defaultPrice: "R$397,00",
  defaultInstallments: "12x de R$39,67",
}

const githubHeaders = () => ({
  Authorization: `Bearer ${config.githubToken}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "ozap-office-promo-agent",
})

const getActivePromo = async (): Promise<ToolResult> => {
  try {
    const response = await fetch(API_BASE, { headers: githubHeaders() })

    if (response.status === 404) {
      return { content: JSON.stringify({ exists: false, message: "No promo config found. Use updatePromoConfig to create one." }) }
    }

    if (!response.ok) {
      return { content: `GitHub API error: ${response.status} ${response.statusText}`, isError: true }
    }

    const data = await response.json() as { content: string; sha: string }
    const decoded = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"))
    const now = new Date()
    const endDate = new Date(decoded.endDate)
    const isExpired = now > endDate

    return {
      content: JSON.stringify({
        exists: true,
        sha: data.sha,
        isExpired,
        daysRemaining: isExpired ? 0 : Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        config: decoded,
      }),
    }
  } catch (error) {
    return { content: `Failed to read promo config: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

const updatePromoConfig = async (input: Record<string, unknown>): Promise<ToolResult> => {
  try {
    const promoName = input.promoName as string
    const emoji = input.emoji as string
    const endDate = input.endDate as string
    const badgeText = input.badgeText as string
    const isActive = input.isActive as boolean

    if (!promoName || !endDate || !badgeText) {
      return { content: "promoName, endDate, and badgeText are required", isError: true }
    }

    const promoConfig = {
      isActive: isActive ?? true,
      promoName,
      badgeText,
      emoji: emoji ?? "",
      endDate,
      ...PROMO_DEFAULTS,
    }

    const content = Buffer.from(JSON.stringify(promoConfig, null, 2)).toString("base64")

    let sha: string | undefined
    const existingResponse = await fetch(API_BASE, { headers: githubHeaders() })
    if (existingResponse.ok) {
      const existing = await existingResponse.json() as { sha: string }
      sha = existing.sha
    }

    const body: Record<string, unknown> = {
      message: `promo: ${promoName} until ${endDate.split("T")[0]}`,
      content,
      branch: "main",
    }
    if (sha) body.sha = sha

    const putResponse = await fetch(API_BASE, {
      method: "PUT",
      headers: { ...githubHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!putResponse.ok) {
      const errorBody = await putResponse.text()
      return { content: `GitHub API error: ${putResponse.status} — ${errorBody}`, isError: true }
    }

    return {
      content: JSON.stringify({
        success: true,
        message: `Promo config updated: "${promoName}" until ${endDate}. Vercel will auto-deploy in ~30s.`,
        config: promoConfig,
      }),
    }
  } catch (error) {
    return { content: `Failed to update promo config: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

export const executePromoTool = async (
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> => {
  const tools: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> = {
    getActivePromo: () => getActivePromo(),
    updatePromoConfig,
  }

  const handler = tools[toolName]
  if (!handler) return { content: `Unknown promo tool: ${toolName}`, isError: true }

  return handler(input)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/tools/promo.ts
git commit -m "feat(promo): add promo tool module with GitHub API read/write"
```

---

## Task 3: Register promo tools in tool-executor

**Files:**
- Modify: `apps/server/src/runtime/tool-executor.ts`

- [ ] **Step 1: Add import and routing**

Add the import at the top with the other tool imports:

```typescript
import { executePromoTool } from "../tools/promo.js"
```

Add the tool name constant after `ANALYTICS_TOOLS`:

```typescript
const PROMO_TOOLS = ["getActivePromo", "updatePromoConfig"]
```

Add the routing block inside `executeTool`, before the `Unknown tool` return:

```typescript
if (PROMO_TOOLS.includes(toolName)) {
  return executePromoTool(toolName, toolInput)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/runtime/tool-executor.ts
git commit -m "feat(promo): register promo tools in tool executor"
```

---

## Task 4: Add Promo agent to seed and update Leader

**Files:**
- Modify: `apps/server/src/db/seed.ts`

- [ ] **Step 1: Add promo tools array**

Add after the `trafficTools` array (before `agentsToSeed`):

```typescript
const promoTools = [
  {
    name: "getActivePromo",
    description: "Read the current active promotion config from the ZapGPT landing page. Returns the promo name, end date, status (expired or active), days remaining, and the file SHA needed for updates.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "updatePromoConfig",
    description: "Create or update the promotion on the ZapGPT landing page. Commits a new promo-config.json to the zap-landing GitHub repo. Vercel auto-deploys in ~30 seconds.",
    inputSchema: {
      type: "object",
      properties: {
        promoName: { type: "string", description: "Nome da promoção (ex: 'Promoção de Páscoa', 'Oferta Especial de Maio')" },
        emoji: { type: "string", description: "Emoji temático da promoção (ex: '🐣', '🔥', '🎄', '🎉')" },
        endDate: { type: "string", description: "Data e hora de fim da promoção em ISO 8601 (ex: '2026-04-20T23:59:59')" },
        badgeText: { type: "string", description: "Texto do badge no banner (ex: 'PROMOÇÃO DE PÁSCOA', 'BLACK FRIDAY')" },
        isActive: { type: "boolean", description: "Se a promoção está ativa (true) ou desativada (false). Padrão: true" },
      },
      required: ["promoName", "endDate", "badgeText"],
    },
  },
]
```

- [ ] **Step 2: Add Promo agent to agentsToSeed array**

Add as the last entry in `agentsToSeed`:

```typescript
{
  name: "Promo",
  role: "Promotional Campaign Manager",
  systemPrompt: `Você é o Promo, gerente de campanhas promocionais da equipe. Você gerencia as promoções da landing page do ZapGPT de forma autônoma.

## Seu Objetivo
Manter SEMPRE uma promoção ativa na landing page. Nunca deve haver um período sem promoção.

## Calendário de Datas Comemorativas Brasileiras

| Data | Evento | Emoji Sugerido |
|------|--------|----------------|
| 1 Jan | Ano Novo | 🎆 |
| ~Fev/Mar (móvel) | Carnaval | 🎭 |
| 8 Mar | Dia da Mulher | 💜 |
| ~Mar/Abr (móvel) | Páscoa | 🐣 |
| 2º domingo Mai | Dia das Mães | 💐 |
| 12 Jun | Dia dos Namorados | ❤️ |
| 13-29 Jun | Festa Junina | 🎪 |
| 2º domingo Ago | Dia dos Pais | 👔 |
| 15 Set | Dia do Cliente | 🤝 |
| 7 Out | Aniversário ZapGPT | 🎂 |
| 4ª sexta Nov | Black Friday | 🖤 |
| 25 Dez | Natal | 🎄 |

## Regras

1. **Promoção sazonal**: Se uma data comemorativa está dentro de 7-10 dias, crie uma promoção temática para ela. A promoção termina na data do evento (23:59:59).
2. **Promoção genérica**: Se não há data próxima, crie uma promoção genérica com duração de ~2 semanas. Exemplos: "Oferta Especial de [Mês]", "Promoção por Tempo Limitado", "Super Oferta [Mês]".
3. **Sem lacunas**: Quando uma promoção expira ou está prestes a expirar (menos de 2 dias restantes), crie a próxima imediatamente.
4. **Preço fixo**: O preço promocional é SEMPRE R$197,00 e o preço normal é R$397,00. Você NÃO controla os preços — eles são fixos no sistema.
5. **Links fixos**: Os links de pagamento são fixos e gerenciados pelo sistema. Você NÃO precisa informá-los.
6. **Emoji contextual**: Escolha um emoji que combine com a ocasião.
7. **Badge text**: Use texto em MAIÚSCULAS para o badge (ex: "PROMOÇÃO DE PÁSCOA", "BLACK FRIDAY").

## Fluxo de Trabalho

1. Use getActivePromo para verificar a promoção atual
2. Analise: está expirada? Vai expirar em breve? Há uma data comemorativa próxima?
3. Use updatePromoConfig para criar/atualizar a promoção
4. A landing page será atualizada automaticamente via deploy do Vercel (~30s)

## A data atual é fornecida no início do prompt — use-a como referência.`,
  tools: [...promoTools, ...memoryTools],
  schedule: "0 9 * * 1",
  cronPrompt: `Verifique a promoção atual da landing page do ZapGPT. Se estiver expirada ou expirando em menos de 2 dias, crie a próxima promoção. Consulte o calendário de datas comemorativas para decidir se deve ser sazonal ou genérica.`,
  color: "#f59e0b",
  positionX: 11,
  positionY: 4,
},
```

- [ ] **Step 3: Update Leader system prompt to mention Promo agent**

In the Leader's `systemPrompt` string, add to the responsibilities section:

Change the Leader systemPrompt from:

```
- Cross-reference data between agents (e.g., combine Finance revenue with Analytics usage data)
```

To:

```
- Cross-reference data between agents (e.g., combine Finance revenue with Analytics usage data)
- The Promo agent manages landing page promotions — delegate promo-related requests to it
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/db/seed.ts
git commit -m "feat(promo): add Promo agent to seed with calendar and update Leader"
```

---

## Task 5: Create promo config file in zap-landing

**Files:**
- Create: `/Users/marcusgoncalves/projects/zap-landing/src/config/promo-config.json`

- [ ] **Step 1: Create the config directory and initial file**

```json
{
  "isActive": true,
  "promoName": "Promoção de Abril",
  "badgeText": "OFERTA ESPECIAL DE ABRIL",
  "emoji": "🔥",
  "endDate": "2026-04-15T23:59:59",
  "price": "R$197,00",
  "priceOriginal": "R$497",
  "installments": "12x de R$19,67",
  "savings": "ECONOMIA DE R$ 300",
  "pixLink": "https://app.abacatepay.com/pay/bill_ZM4Pm0PgHpjfWzPQ5eRthqjx",
  "cardLink": "https://pay.cakto.com.br/39jee69",
  "defaultPixLink": "https://app.abacatepay.com/pay/bill_yqqpmYHWQGT1D3yCXdxJZCMs",
  "defaultCardLink": "https://pay.cakto.com.br/ijjptyj",
  "defaultPrice": "R$397,00",
  "defaultInstallments": "12x de R$39,67"
}
```

- [ ] **Step 2: Commit in zap-landing repo**

```bash
cd /Users/marcusgoncalves/projects/zap-landing
git add src/config/promo-config.json
git commit -m "feat: add promo config file for agent-managed promotions"
```

---

## Task 6: Create PromoBanner component in zap-landing

**Files:**
- Create: `/Users/marcusgoncalves/projects/zap-landing/src/components/PromoBanner.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect } from "react";
import { ArrowDown, Zap } from "lucide-react";
import promoConfig from "@/config/promo-config.json";

const useCountdown = (targetDate: string) => {
  const [timeLeft, setTimeLeft] = useState({
    dias: 0,
    horas: 0,
    minutos: 0,
    segundos: 0,
    isExpired: false,
  });

  useEffect(() => {
    const target = new Date(targetDate).getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const difference = target - now;

      if (difference <= 0) {
        clearInterval(interval);
        setTimeLeft({ dias: 0, horas: 0, minutos: 0, segundos: 0, isExpired: true });
        return;
      }

      setTimeLeft({
        dias: Math.floor(difference / (1000 * 60 * 60 * 24)),
        horas: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutos: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
        segundos: Math.floor((difference % (1000 * 60)) / 1000),
        isExpired: false,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
};

interface PromoBannerProps {
  scrollToPrice: () => void;
}

export const PromoBanner = ({ scrollToPrice }: PromoBannerProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isFloating, setIsFloating] = useState(true);
  const tempoRestante = useCountdown(promoConfig.endDate);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 1000);
    const floatInterval = setInterval(() => setIsFloating((prev) => !prev), 2000);
    return () => {
      clearTimeout(timer);
      clearInterval(floatInterval);
    };
  }, []);

  if (!promoConfig.isActive || !isVisible || tempoRestante.isExpired) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center transition-all duration-500"
      style={{ transform: isVisible ? "translateY(0)" : "translateY(100%)" }}
    >
      <div
        className={`relative max-w-3xl w-full mx-2 md:mx-4 mb-2 md:mb-4 transition-all duration-1000 ${isFloating ? "translate-y-1" : "-translate-y-1"}`}
      >
        <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-400 via-violet-300 to-purple-600 rounded-xl opacity-70 blur-sm animate-pulse" />
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-purple-300 to-violet-600 rounded-xl opacity-50 blur animate-pulse" />

        <div className="relative bg-gradient-to-br from-violet-950 via-violet-900 to-violet-950 rounded-xl shadow-2xl overflow-hidden">
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-200 to-transparent opacity-30 animate-[shine_3s_infinite]"
            style={{ transform: "skewX(-20deg) translateX(-100%)" }}
          />

          <style jsx>{`
            @keyframes shine {
              0% { transform: skewX(-20deg) translateX(-100%); }
              100% { transform: skewX(-20deg) translateX(200%); }
            }
          `}</style>

          <div className="bg-gradient-to-br from-violet-800 to-violet-900 p-2 md:p-4 rounded-lg m-0.5">
            <div className="flex flex-col md:flex-row items-center justify-between">
              <div className="flex items-center mb-2 md:mb-0">
                <Zap className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2 text-purple-300" />
                <div>
                  <span className="text-[10px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 md:py-1 bg-purple-600 text-white rounded-full">
                    {promoConfig.badgeText} {promoConfig.emoji}
                  </span>
                  <h3 className="text-sm md:text-base text-white font-bold mt-0.5 md:mt-1">
                    ZAP GPT VITALÍCIO <span className="text-purple-300">{promoConfig.price}</span>
                  </h3>
                </div>
              </div>

              <div className="ml-0 md:ml-3 mt-2 md:mt-0 bg-violet-900/70 rounded-lg px-2 py-1 border border-purple-500/30">
                <p className="text-[10px] text-white text-center">Encerra em:</p>
                <div className="flex justify-center space-x-2 text-center">
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-purple-300">{tempoRestante.dias}</span>
                    <span className="text-[8px] text-gray-400">dias</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-purple-300">{tempoRestante.horas}</span>
                    <span className="text-[8px] text-gray-400">h</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-purple-300">{tempoRestante.minutos}</span>
                    <span className="text-[8px] text-gray-400">m</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-purple-300">{tempoRestante.segundos}</span>
                    <span className="text-[8px] text-gray-400">s</span>
                  </div>
                </div>
              </div>

              <div className="mt-2 md:mt-0">
                <button
                  type="button"
                  onClick={scrollToPrice}
                  className="flex items-center px-2 md:px-3 py-1 md:py-1.5 bg-gradient-to-r from-purple-500 to-violet-500 text-white text-xs md:text-sm font-medium rounded-lg hover:from-purple-400 hover:to-violet-400 transition-all duration-300 hover:shadow-xl"
                >
                  <ArrowDown className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                  Ver preços
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit in zap-landing repo**

```bash
cd /Users/marcusgoncalves/projects/zap-landing
git add src/components/PromoBanner.tsx
git commit -m "feat: add PromoBanner component with countdown and purple theme"
```

---

## Task 7: Update LP pricing section to read from promo config

**Files:**
- Modify: `/Users/marcusgoncalves/projects/zap-landing/src/pages/index.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/pages/index.tsx`, add:

```typescript
import { PromoBanner } from "@/components/PromoBanner";
import promoConfig from "@/config/promo-config.json";
```

- [ ] **Step 2: Add promo state logic**

Inside the `Home` component, after the existing `pricingSectionRef`, add a helper to determine if promo is active at runtime:

```typescript
const isPromoActive = promoConfig.isActive && new Date(promoConfig.endDate) > new Date();
const currentPrice = isPromoActive ? promoConfig.price : promoConfig.defaultPrice;
const currentInstallments = isPromoActive ? promoConfig.installments : promoConfig.defaultInstallments;
const currentPixLink = isPromoActive ? promoConfig.pixLink : promoConfig.defaultPixLink;
const currentCardLink = isPromoActive ? promoConfig.cardLink : promoConfig.defaultCardLink;
```

- [ ] **Step 3: Add PromoBanner component**

Inside the return JSX, right after the opening `<div className="bg-gray-900 text-white min-h-screen">`, add:

```tsx
<PromoBanner scrollToPrice={scrollToPrice} />
```

- [ ] **Step 4: Update pricing card to use config values**

In the pricing section (around line 2031-2098), replace the hardcoded values:

Replace the price display block:
```tsx
<span className="text-2xl text-gray-400 line-through">
    de R$ 497
</span>
<div className="inline-flex items-baseline">
    <span className="text-6xl md:text-7xl font-black bg-gradient-to-r from-teal-400 to-green-400 bg-clip-text text-transparent">
        R$ 197
    </span>
</div>
<span className="px-4 py-1 bg-gradient-to-r from-red-500 to-orange-500 text-white text-sm font-bold rounded-full animate-pulse">
    ECONOMIA DE R$ 300
</span>
```

With:
```tsx
{isPromoActive && (
    <span className="text-2xl text-gray-400 line-through">
        de {promoConfig.priceOriginal}
    </span>
)}
<div className="inline-flex items-baseline">
    <span className="text-6xl md:text-7xl font-black bg-gradient-to-r from-teal-400 to-green-400 bg-clip-text text-transparent">
        {currentPrice}
    </span>
</div>
{isPromoActive && (
    <span className="px-4 py-1 bg-gradient-to-r from-red-500 to-orange-500 text-white text-sm font-bold rounded-full animate-pulse">
        {promoConfig.savings}
    </span>
)}
```

Replace the payment button `onClick` handler:
```tsx
openPaymentModal({
    pixLink: 'https://app.abacatepay.com/pay/bill_ZM4Pm0PgHpjfWzPQ5eRthqjx',
    cardLink: 'https://pay.cakto.com.br/39jee69',
    planName: 'Zap GPT Vitalício',
    precoParcelado: '12x de R$19,67',
    precoAvista: 'R$197,00',
    tempo: 'Vitalício',
});
```

With:
```tsx
openPaymentModal({
    pixLink: currentPixLink,
    cardLink: currentCardLink,
    planName: 'Zap GPT Vitalício',
    precoParcelado: currentInstallments,
    precoAvista: currentPrice,
    tempo: 'Vitalício',
});
```

- [ ] **Step 5: Verify locally**

```bash
cd /Users/marcusgoncalves/projects/zap-landing
pnpm dev --port 3333
```

Open `http://localhost:3333` — verify:
- Promo banner appears at bottom after 1 second
- Pricing shows R$197 with strikethrough R$497 and savings badge
- "Ver precos" button scrolls to pricing section
- Countdown ticks down

- [ ] **Step 6: Commit in zap-landing repo**

```bash
cd /Users/marcusgoncalves/projects/zap-landing
git add src/pages/index.tsx
git commit -m "feat: integrate promo config into pricing section and add banner"
```

---

## Task 8: Build, seed, and deploy ozap-office

- [ ] **Step 1: Build and typecheck ozap-office**

```bash
cd /Users/marcusgoncalves/projects/ozap-office
pnpm -F @ozap-office/server typecheck
pnpm build
```

Fix any type errors.

- [ ] **Step 2: Commit any fixes**

- [ ] **Step 3: Push ozap-office and deploy via SSM**

Push to main, then run the deploy command from CLAUDE.md. Remember to add `GITHUB_TOKEN` to the `.env` on EC2 first.

- [ ] **Step 4: Run seed on EC2**

The deploy command already runs `db:seed`, which will upsert the new Promo agent.

---

## Task 9: Push zap-landing and verify Vercel deploy

- [ ] **Step 1: Push zap-landing to main**

```bash
cd /Users/marcusgoncalves/projects/zap-landing
git push origin main
```

Vercel will auto-deploy.

- [ ] **Step 2: Verify the live LP**

Check that the LP shows the promo banner and correct pricing.

---

## Task 10: Test Promo agent manually

- [ ] **Step 1: Trigger the Promo agent manually**

Via the Ozap Office UI or API:

```bash
curl -X POST http://localhost:3001/api/agents/<promo-agent-id>/run \
  -H "x-api-key: <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"message": "Verifique a promoção atual e crie uma nova se necessário."}'
```

- [ ] **Step 2: Verify the agent**

Check that:
- Agent reads the current config via `getActivePromo`
- Agent reasons about the current promo state
- If it decides to update, it calls `updatePromoConfig` and the commit appears in the `zap-landing` repo
- Vercel redeploys and the LP updates
