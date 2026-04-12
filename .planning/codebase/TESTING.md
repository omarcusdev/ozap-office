# Testing Patterns

**Analysis Date:** 2026-04-12

## Test Framework

**Runner:** None. No test framework is installed or configured in any package.

**Test files:** Zero test files exist in the repository. No `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx` files are present.

**Coverage:** No coverage configuration or tooling.

## Type Checking

Type checking is the primary correctness mechanism in this codebase. All packages expose a `typecheck` script.

**Run Commands:**
```bash
pnpm -F @ozap-office/server typecheck   # tsc --noEmit for server
pnpm -F @ozap-office/web typecheck      # tsc --noEmit for web
pnpm -F @ozap-office/shared build       # compiles shared types (tsc)
```

**TypeScript config:**
- Base config: `tsconfig.base.json` (root) — `strict: true`, ES2022 target, ESNext modules
- Server: `apps/server/tsconfig.json` — extends base, outputs to `dist/`, type: module (ESM)
- Web: `apps/web/tsconfig.json` — extends base, `noEmit: true`, adds `dom` lib, `@/*` path alias, Next.js plugin
- Shared: `packages/shared/tsconfig.json` — extends base, outputs to `dist/`

## Build Verification

Build commands serve as integration checks:

```bash
pnpm build                              # build all packages (pnpm -r build)
pnpm -F @ozap-office/shared build       # tsc — required before server/web
pnpm -F @ozap-office/server build       # tsc — compiles to dist/
pnpm -F @ozap-office/web build          # next build — full Next.js production build
```

Build order matters: `shared` must build first because `server` and `web` import from `@ozap-office/shared`.

## CI/CD

**No CI pipeline.** There is no `.github/` directory and no CI configuration files (no GitHub Actions, no CircleCI, no similar).

**Deployment is manual** via AWS SSM `send-command` to EC2 instance `i-025ac97362e218181`. The deploy script runs `git pull → pnpm install → pnpm build → db:migrate → db:seed → pm2 restart`. See `CLAUDE.md` for the full deploy command.

## Runtime Verification

Given the absence of automated tests, correctness is verified by:

1. **TypeScript compilation** — catches type errors at build time
2. **Manual testing on production** — the project is deployed directly to the live EC2 instance and verified via the browser and server logs
3. **PM2 process logs** — errors surface in `/root/.pm2/logs/ozap-office-server-out.log`

**View server logs:**
```bash
AWS_PROFILE=ozapgpt aws ssm send-command \
  --instance-ids i-025ac97362e218181 \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["export HOME=/root && cat /root/.pm2/logs/ozap-office-server-out.log | tail -50"]}' \
  --timeout-seconds 30 \
  --query 'Command.CommandId' --output text --region us-east-1
```

## Adding Tests (Future Guidance)

If tests are added, the natural framework choice given the existing stack would be:

- **Server:** Vitest (ESM-native, works with `"type": "module"` in `apps/server/package.json`)
- **Web:** Vitest + React Testing Library

Key areas that would benefit from test coverage:
- Tool handler logic in `apps/server/src/tools/` (pure input→output functions, easy to unit test)
- Revenue/aggregation calculations in `apps/server/src/tools/finance.ts` (deterministic math)
- Drizzle query builders in `apps/server/src/runtime/executor.ts` (would need DB mocking)
- Zustand store actions in `apps/web/lib/stores/` (pure state transitions)

---

*Testing analysis: 2026-04-12*
