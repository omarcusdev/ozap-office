# Technology Stack

**Analysis Date:** 2026-04-12

## Languages

**Primary:**
- TypeScript 5.9.3 - All packages (server, web, shared). Strict mode enabled, ES2022 target, ESM modules.

**Secondary:**
- JavaScript (`.mjs`) - `check-events.mjs` utility script at project root.

## Runtime

**Environment:**
- Node.js >=20 (required by `engines` field in root `package.json`). Dev machine runs v22.11.0.

**Package Manager:**
- pnpm 10.29.1
- Lockfile: `pnpm-lock.yaml` present and committed.
- Workspace config: `pnpm-workspace.yaml` — two package groups: `packages/*` and `apps/*`.

## Frameworks

**Server:**
- Fastify 5.8.2 — HTTP API server in `apps/server`. ESM module type. Entry: `apps/server/src/index.ts`.
- `@fastify/cors` 10.1.0 — CORS plugin.
- `@fastify/websocket` 11.2.0 — WebSocket plugin (wraps `ws` library).

**Frontend:**
- Next.js 15.5.12 — App Router, `apps/web/app/` for routes. Config: `apps/web/next.config.ts`. Transpiles `@ozap-office/shared`.
- React 19.2.4 — UI rendering.
- Tailwind CSS 4.2.1 — Utility-first styling. PostCSS via `@tailwindcss/postcss` 4.0.

**Testing:**
- Not detected. No test runner configured in any package.

**Build/Dev:**
- `tsx` 4.21.0 — TypeScript execution for server dev (`tsx watch src/index.ts`) and seed scripts.
- `tsc` (TypeScript compiler) — Production build for server (`apps/server`) and shared (`packages/shared`). Outputs to `dist/`.
- `next build` — Production build for web (`apps/web`).
- `drizzle-kit` 0.30.6 — DB migration generation and execution. Config: `apps/server/drizzle.config.ts`.

## Key Dependencies

**AI / ML:**
- `@aws-sdk/client-bedrock-runtime` 3.1009.0 — AWS Bedrock Converse API for agent LLM calls. Client in `apps/server/src/runtime/bedrock.ts`. Default model: `us.anthropic.claude-sonnet-4-6`.

**Database:**
- `drizzle-orm` 0.36.4 — ORM with type-safe query builder. Client in `apps/server/src/db/client.ts`.
- `postgres` 3.4.8 — PostgreSQL driver for both primary DB and read-only ZapGPT DB connections.

**Scheduling:**
- `node-cron` 3.0.3 — Cron-based agent triggers. Scheduler in `apps/server/src/scheduler/`.

**Twitter/X:**
- `twitter-api-v2` 1.29.0 — Twitter client. Wrapper in `apps/server/src/integrations/twitter-client.ts`.

**ID Generation:**
- `nanoid` 5.1.6 — Unique ID generation.

**Frontend State:**
- `zustand` 5.0.12 — Client-side state management. Stores in `apps/web/lib/stores/`.
- `@tanstack/react-query` 5.96.1 — Server state / data fetching. Queries in `apps/web/lib/queries/`.

**Frontend UI:**
- Radix UI primitives — `collapsible`, `dialog`, `dropdown-menu`, `scroll-area`, `separator`, `slot`, `tabs` (all ~1.x).
- `lucide-react` 1.7.0 — Icons.
- `class-variance-authority` 0.7.1 + `clsx` 2.1.1 + `tailwind-merge` 3.5.0 — Component variant utilities. shadcn/ui pattern in `apps/web/lib/components/ui/`.

**Frontend Markdown:**
- `react-markdown` 10.1.0 + `rehype-highlight` 7.0.2 + `remark-gfm` 4.0.1 + `highlight.js` 11.11.1 — Markdown rendering with syntax highlighting in agent conversation UI.

**Utilities:**
- `dotenv` 16.6.1 — Env file loading. Loaded via `import "dotenv/config"` at server entry point.

## Configuration

**TypeScript:**
- Base config: `tsconfig.base.json` — ES2022 target, ESNext modules, bundler resolution, strict mode, sourceMap.
- Server extends base with `outDir: dist`, `rootDir: src`. Path: `apps/server/tsconfig.json`.
- Web extends base with JSX preserve, `paths: { "@/*": ["./*"] }`, Next.js plugin. Path: `apps/web/tsconfig.json`.
- Shared extends base. Path: `packages/shared/tsconfig.json`.

**Environment:**
- Server reads from `.env` via dotenv at startup. Schema defined in `apps/server/src/config.ts`.
- Required: `DATABASE_URL`, `OZAP_OFFICE_API_KEY`.
- Optional: `AWS_REGION` (default: `us-east-1`), `PORT` (default: `3001`), `CORS_ORIGIN` (default: `http://localhost:3000`), all integration secrets.
- Frontend uses `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_API_KEY`.

**Build:**
- Server: `tsc` emits to `apps/server/dist/`. Production entry: `apps/server/dist/index.js`.
- Web: `next build` outputs to `apps/web/.next/`.
- Shared: `tsc` emits to `packages/shared/dist/`. Consumed by both apps via workspace `link:`.

## Platform Requirements

**Development:**
- Node.js >=20, pnpm 10.x.
- `meta-ads-mcp` binary must be available on PATH for Meta Ads integration (spawned as child process).

**Production:**
- EC2 (us-east-1), PM2 process manager.
- Server cwd must be `/opt/ozap-office` for dotenv to locate `.env`.
- Web cwd must be `/opt/ozap-office/apps/web` for Next.js to locate `.next/`.
- Nginx reverse proxies port 80 to Next.js :3000 and API/WebSocket :3001.
- PostgreSQL runs locally on the EC2 instance (not managed RDS).

---

*Stack analysis: 2026-04-12*
