# Promo Agent — Seasonal Promotion Manager

## Overview

A new autonomous agent in Ozap Office that manages seasonal and generic promotions for the ZapGPT landing page. The agent runs on a weekly cron, decides which promo to activate based on a Brazilian holiday calendar, and commits a config file to the `zap-landing` repo via GitHub API. The LP reads this config at build time — no runtime dependency on Ozap Office.

## Goals

- Always have an active promotion on the LP (seasonal or generic fallback)
- Fully autonomous — no manual approval needed
- Zero runtime coupling between Ozap Office and the LP
- Maintain the existing ZapGPT purple/violet promo banner style

## Architecture

### Data Flow

```
Weekly cron (Monday 9 AM)
  -> Promo agent wakes up
  -> getActivePromo: reads promo-config.json from zap-landing GitHub repo
  -> Agent reasons about current state + upcoming dates
  -> updatePromoConfig: commits updated promo-config.json to zap-landing
  -> Vercel auto-deploys (~30s)
  -> LP shows new banner + correct pricing/links
```

### Components

1. **Promo Agent** (Ozap Office) — new agent in seed.ts
2. **Tool module** (`tools/promo.ts`) — GitHub API read/write
3. **Config file** (`zap-landing/src/config/promo-config.json`) — static JSON
4. **PromoBanner component** (`zap-landing/src/components/PromoBanner.tsx`) — fixed bottom banner
5. **Pricing section update** (`zap-landing/src/pages/index.tsx`) — reads config for price/links

## Ozap Office Changes

### Agent Definition (seed.ts)

- **Name**: Promo
- **Role**: Promotional Campaign Manager
- **Position**: new desk in the office grid
- **Schedule**: `"0 9 * * 1"` (Mondays 9 AM)
- **CronPrompt**: "Check the current active promo on the ZapGPT landing page. If it's expired or expiring within 2 days, create the next promotion. If a Brazilian commemorative date is within 7-10 days, create a seasonal promo for it. Otherwise, create a generic promo for the current period."

#### System Prompt Contents

The system prompt (Portuguese) includes:

- Agent role: manage ZapGPT LP promotions autonomously
- Brazilian commemorative dates calendar:
  - Ano Novo (Jan 1)
  - Carnaval (movable, ~Feb/Mar)
  - Dia da Mulher (Mar 8)
  - Pascoa (movable, ~Mar/Apr)
  - Dia das Maes (2nd Sunday of May)
  - Dia dos Namorados (Jun 12)
  - Festa Junina (Jun 13-29)
  - Dia dos Pais (2nd Sunday of August)
  - Dia do Cliente (Sep 15)
  - Black Friday (4th Friday of November)
  - Natal (Dec 25)
  - Aniversario ZapGPT (Oct 7)
- Rules:
  - Always keep a promo active, no dead time
  - Seasonal promos: start 7-10 days before the date, end on the actual date
  - Generic promos: "Oferta Especial de [Mes]", "Promocao por Tempo Limitado", etc. Last ~2 weeks
  - Pick a contextual emoji for each promo
  - Never change the promo price (always R$197 when active) or default price (R$397)
  - Payment links are fixed — promo links and default links are hardcoded in the config

#### Tools

- `getActivePromo` — read current config
- `updatePromoConfig` — commit new config
- `updateCoreMemory` / `deleteCoreMemory` / `saveToArchive` / `searchArchive` — standard memory tools

### Tool Module (tools/promo.ts)

`executePromoTool(toolName, toolInput)` handles two tools:

**getActivePromo** (no inputs):
- `GET https://api.github.com/repos/omarcusdev/zap-landing/contents/src/config/promo-config.json`
- Decodes base64 content, returns parsed JSON
- Also returns the file SHA (needed for updates)
- If file doesn't exist, returns `{ exists: false }`

**updatePromoConfig** (inputs: `promoName`, `emoji`, `endDate`, `badgeText`, `isActive`):
- Builds the full config JSON including fixed payment links and prices
- `PUT https://api.github.com/repos/omarcusdev/zap-landing/contents/src/config/promo-config.json`
- Commit message: `"promo: {promoName} until {endDate}"`
- Requires the file SHA from a prior `getActivePromo` call (or creates if file doesn't exist)

### Environment

New env var: `GITHUB_TOKEN` — a GitHub personal access token with `contents:write` scope on the `zap-landing` repo. Added to `.env` on EC2.

### Tool Executor Registration (tool-executor.ts)

Register `getActivePromo` and `updatePromoConfig` to route to `executePromoTool`.

### Leader Agent Update

Update the Leader's system prompt to include the Promo agent in the team roster so the Leader can delegate promo-related requests (e.g., "create a special promo for X" or "what's the current promo?").

## Landing Page Changes (zap-landing repo)

### Config File: `src/config/promo-config.json`

```json
{
  "isActive": true,
  "promoName": "Promocao de Pascoa",
  "badgeText": "PROMOCAO DE PASCOA",
  "emoji": "\ud83d\udc23",
  "endDate": "2026-04-20T23:59:59",
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

### PromoBanner Component: `src/components/PromoBanner.tsx`

Fixed bottom floating banner matching existing ZapGPT style:
- Purple/violet gradient with glowing border and shine sweep animation
- Zap icon + badge text (promo name) + countdown timer + "Ver precos" CTA button
- Uses `useCountdown` hook with `endDate` from config
- Auto-hides when countdown reaches zero
- Appears after 1 second delay with slide-up animation
- Floating animation (subtle up/down)

### Pricing Section Update: `src/pages/index.tsx`

The pricing card reads from the imported config:
- If `isActive === true` AND `endDate` not expired:
  - Show promo price (R$197), promo installments, promo savings badge
  - Use `pixLink` and `cardLink` for payment buttons
  - Render PromoBanner component
- If `isActive === false` OR `endDate` expired:
  - Show default price (R$397)
  - Use `defaultPixLink` and `defaultCardLink` for payment buttons
  - No banner

Price display uses strikethrough on original price (R$497 when promo active) with animated "ECONOMIA" badge — same pattern as current LP.

## What This Does NOT Change

- No new DB tables in Ozap Office
- No new API endpoints on Ozap Office server
- No changes to the WebSocket/event system
- Price values are never decided by the agent — they're hardcoded in the config
- Payment links are never decided by the agent — they're hardcoded in the config
- The agent only controls: promo name, badge text, emoji, end date, and isActive flag

## Testing

- Manually trigger the Promo agent and verify it reads/writes the config correctly
- Verify LP renders the banner with the committed config
- Verify LP falls back to default pricing when promo is expired
- Verify Vercel auto-deploys on config commit
