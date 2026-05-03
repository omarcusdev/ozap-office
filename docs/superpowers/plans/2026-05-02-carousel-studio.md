# Carousel Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone local Next.js micro-app that turns structured slide-copy JSON into brand-consistent Instagram carousel images via OpenAI `gpt-image-2`, with `localStorage`-backed brand kit, SSE-streamed parallel generation, and ZIP download.

**Architecture:** Single Next.js 15 process. Browser holds session state in `localStorage` and POSTs to API routes. Server validates with Zod, fans out gpt-image-2 calls with a concurrency cap of 4, streams each result back over SSE. Pure-function libs (`prompt`, `cost`, `schema`) are TDD'd before any UI.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5.x, Tailwind v4, Zod, OpenAI Node SDK (gpt-image-2), JSZip, Vitest, sharp (for color swatch generation).

**Spec:** `docs/superpowers/specs/2026-05-02-carousel-studio-design.md`

**Repo location:** This plan lives in `ozap-office`, but the implementation is a **new, separate repo** at `~/projects/carousel-studio/` (sibling of `ozap-office/`). Task 1 creates it. The agent should `cd ~/projects/carousel-studio` before every command unless noted otherwise.

**Coding conventions:** No comments in code (names should self-document). No classes / no `this`. Use only `const` (no `let`/`var`). Functions and closures over inheritance. No shared mutable state — pure functions wherever possible.

---

## Chunk 1: Project Foundation

### Task 1: Initialize repo and Next.js scaffold

**Files:**
- Create: `~/projects/carousel-studio/package.json`
- Create: `~/projects/carousel-studio/tsconfig.json`
- Create: `~/projects/carousel-studio/next.config.mjs`
- Create: `~/projects/carousel-studio/.gitignore`
- Create: `~/projects/carousel-studio/app/layout.tsx`
- Create: `~/projects/carousel-studio/app/page.tsx`
- Create: `~/projects/carousel-studio/app/globals.css`
- Create: `~/projects/carousel-studio/postcss.config.mjs`

- [ ] **Step 1: Create the directory and init git**

Run from `~/projects/`:
```bash
mkdir carousel-studio && cd carousel-studio && git init && git branch -m main
```
Expected: empty git repo on `main`.

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "carousel-studio",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "jszip": "^3.10.1",
    "next": "^15.0.0",
    "openai": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sharp": "^0.34.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `next.config.mjs`, `postcss.config.mjs`, `.gitignore`**

`next.config.mjs`:
```js
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } }
}
export default nextConfig
```

`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } }
```

`.gitignore`:
```
node_modules
.next
.env.local
.env*.local
out
dist
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 5: Write minimal `app/layout.tsx`, `app/page.tsx`, `app/globals.css`**

`app/globals.css`:
```css
@import "tailwindcss";

:root {
  --bg: #0b0d12;
  --fg: #e8edf5;
}

html, body { height: 100%; }
body { background: var(--bg); color: var(--fg); font-family: ui-sans-serif, system-ui; }
```

`app/layout.tsx`:
```tsx
import "./globals.css"

export const metadata = { title: "Carousel Studio" }

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang="en">
    <body>{children}</body>
  </html>
)

export default RootLayout
```

`app/page.tsx`:
```tsx
const Page = () => (
  <main className="min-h-screen p-8">
    <h1 className="text-3xl font-bold">Carousel Studio</h1>
    <p className="mt-2 opacity-70">Scaffold ready. UI lands in later tasks.</p>
  </main>
)

export default Page
```

- [ ] **Step 6: Install deps and verify dev server**

```bash
pnpm install
pnpm dev
```
Expected: `pnpm dev` starts Next on `http://localhost:3000`. Open it and see the heading. Stop the server (`Ctrl+C`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 + Tailwind v4 + TS"
```

---

### Task 2: Configure Vitest and env files

**Files:**
- Create: `~/projects/carousel-studio/vitest.config.ts`
- Create: `~/projects/carousel-studio/.env.example`
- Create: `~/projects/carousel-studio/.env.local` (not committed)

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    globals: false
  },
  resolve: {
    alias: { "@": new URL(".", import.meta.url).pathname }
  }
})
```

- [ ] **Step 2: Write `.env.example` and `.env.local`**

`.env.example`:
```
OPENAI_API_KEY=sk-replace-me
```

`.env.local` (placeholder — Marcus fills in his real key):
```
OPENAI_API_KEY=sk-replace-with-real-key
```

- [ ] **Step 3: Verify Vitest runs (no tests yet)**

```bash
pnpm test
```
Expected: `No test files found` is OK. Process exits 0 or 1 — that's fine, it'll pass once tests exist.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts .env.example
git commit -m "chore: add vitest config and env example"
```

---

## Chunk 2: Pure Libs (TDD)

### Task 3: `lib/schema.ts` — Zod input schema

**Files:**
- Create: `~/projects/carousel-studio/lib/schema.ts`
- Create: `~/projects/carousel-studio/lib/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { CarouselInputSchema } from "./schema"

const validInput = {
  topic: "Why your CV is dead",
  total: 2,
  slides: [
    { index: 1, title: "Hello", accent: "World", subtitle: "Sub", mascot: true, layout: "centered_text" },
    { index: 2, title: "Two", mascot: false, layout: "quote" }
  ]
}

describe("CarouselInputSchema", () => {
  it("accepts a valid input", () => {
    const result = CarouselInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it("rejects when slides.length !== total", () => {
    const result = CarouselInputSchema.safeParse({ ...validInput, total: 5 })
    expect(result.success).toBe(false)
  })

  it("rejects when total exceeds 20", () => {
    const slides = Array.from({ length: 21 }, (_, i) => ({
      index: i + 1, title: "x", mascot: false, layout: "quote" as const
    }))
    const result = CarouselInputSchema.safeParse({ topic: "t", total: 21, slides })
    expect(result.success).toBe(false)
  })

  it("rejects when index sequence has gaps", () => {
    const bad = {
      ...validInput,
      slides: [
        { index: 1, title: "a", mascot: false, layout: "quote" as const },
        { index: 3, title: "b", mascot: false, layout: "quote" as const }
      ],
      total: 2
    }
    const result = CarouselInputSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it("rejects unknown layout", () => {
    const result = CarouselInputSchema.safeParse({
      ...validInput,
      slides: [{ index: 1, title: "x", mascot: false, layout: "weird" }],
      total: 1
    })
    expect(result.success).toBe(false)
  })

  it("rejects title over 80 chars", () => {
    const bad = {
      topic: "t",
      total: 1,
      slides: [{ index: 1, title: "x".repeat(81), mascot: false, layout: "quote" as const }]
    }
    const result = CarouselInputSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test lib/schema.test.ts
```
Expected: FAIL — `CarouselInputSchema` is not defined.

- [ ] **Step 3: Implement `lib/schema.ts`**

```ts
import { z } from "zod"

export const SlideLayoutSchema = z.enum([
  "centered_text",
  "mascot_hero",
  "icon_list",
  "mock_ui",
  "quote"
])

export const SlideSpecSchema = z.object({
  index: z.number().int().positive(),
  title: z.string().min(1).max(80),
  accent: z.string().max(80).optional(),
  subtitle: z.string().max(200).optional(),
  mascot: z.boolean(),
  layout: SlideLayoutSchema,
  extras: z.string().max(300).optional()
})

export const CarouselInputSchema = z.object({
  topic: z.string().min(1).max(200),
  total: z.number().int().min(1).max(20),
  slides: z.array(SlideSpecSchema).min(1).max(20)
}).refine(
  (input) => input.slides.length === input.total,
  { message: "slides.length must equal total" }
).refine(
  (input) => input.slides.every((slide, i) => slide.index === i + 1),
  { message: "slide indices must be 1, 2, 3, ... with no gaps" }
)

export type SlideLayout = z.infer<typeof SlideLayoutSchema>
export type SlideSpec = z.infer<typeof SlideSpecSchema>
export type CarouselInput = z.infer<typeof CarouselInputSchema>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test lib/schema.test.ts
```
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/schema.ts lib/schema.test.ts
git commit -m "feat(lib): zod schema for carousel input with hard caps and index validation"
```

---

### Task 4: `lib/cost.ts` — Cost estimator

**Files:**
- Create: `~/projects/carousel-studio/lib/cost.ts`
- Create: `~/projects/carousel-studio/lib/cost.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/cost.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { estimateCost, qualityToApiParams } from "./cost"

describe("qualityToApiParams", () => {
  it("maps low to (low, 1024)", () => {
    expect(qualityToApiParams("low")).toEqual({ quality: "low", size: "1024x1024" })
  })
  it("maps medium to (medium, 1024)", () => {
    expect(qualityToApiParams("medium")).toEqual({ quality: "medium", size: "1024x1024" })
  })
  it("maps high to (high, 1024)", () => {
    expect(qualityToApiParams("high")).toEqual({ quality: "high", size: "1024x1024" })
  })
  it("maps 4k to (high, 4096)", () => {
    expect(qualityToApiParams("4k")).toEqual({ quality: "high", size: "4096x4096" })
  })
})

describe("estimateCost", () => {
  it("scales linearly with slide count", () => {
    const single = estimateCost(1, "high")
    const eleven = estimateCost(11, "high")
    expect(eleven).toBeCloseTo(single * 11, 5)
  })
  it("4k is more expensive than high at 1024", () => {
    expect(estimateCost(1, "4k")).toBeGreaterThan(estimateCost(1, "high"))
  })
  it("low is cheapest", () => {
    const low = estimateCost(1, "low")
    const medium = estimateCost(1, "medium")
    expect(low).toBeLessThan(medium)
  })
  it("returns positive number", () => {
    expect(estimateCost(11, "high")).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test lib/cost.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/cost.ts`**

```ts
export type QualityChoice = "low" | "medium" | "high" | "4k"

export type ApiParams = {
  quality: "low" | "medium" | "high"
  size: "1024x1024" | "4096x4096"
}

const PRICE_PER_IMAGE: Record<QualityChoice, number> = {
  low: 0.01,
  medium: 0.04,
  high: 0.08,
  "4k": 0.41
}

export const qualityToApiParams = (choice: QualityChoice): ApiParams => {
  if (choice === "4k") return { quality: "high", size: "4096x4096" }
  return { quality: choice, size: "1024x1024" }
}

export const estimateCost = (slideCount: number, choice: QualityChoice): number =>
  PRICE_PER_IMAGE[choice] * slideCount

export const formatCost = (usd: number): string => `$${usd.toFixed(2)}`
```

> Pricing constants come from the May 2026 OpenAI gpt-image-2 published rates. Adjust if rates move.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test lib/cost.test.ts
```
Expected: PASS — 8 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/cost.ts lib/cost.test.ts
git commit -m "feat(lib): cost estimator and quality->api param mapping"
```

---

### Task 5: `lib/prompt.ts` — Prompt composer (the secret sauce)

**Files:**
- Create: `~/projects/carousel-studio/lib/prompt.ts`
- Create: `~/projects/carousel-studio/lib/prompt.test.ts`

- [ ] **Step 1: Write snapshot tests, one per layout**

`lib/prompt.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { composePrompt } from "./prompt"
import type { SlideSpec } from "./schema"

const baseBrandKit = {
  primaryHex: "#1a2745",
  accentHex: "#2d7eff"
}

const baseSlide: SlideSpec = {
  index: 2,
  title: "Você não é um currículo",
  accent: "currículo",
  subtitle: "Você é uma trajetória!",
  mascot: true,
  layout: "centered_text"
}

describe("composePrompt", () => {
  it("centered_text layout snapshot", () => {
    expect(composePrompt(baseSlide, baseBrandKit, 11)).toMatchSnapshot()
  })

  it("mascot_hero layout snapshot", () => {
    expect(composePrompt({ ...baseSlide, layout: "mascot_hero" }, baseBrandKit, 11)).toMatchSnapshot()
  })

  it("icon_list layout snapshot", () => {
    expect(composePrompt(
      { ...baseSlide, layout: "icon_list", subtitle: undefined, extras: "items: sua liga, seu nível, seu salário" },
      baseBrandKit,
      11
    )).toMatchSnapshot()
  })

  it("mock_ui layout snapshot", () => {
    expect(composePrompt(
      { ...baseSlide, layout: "mock_ui", mascot: false, extras: "radar plot showing TypeScript skills" },
      baseBrandKit,
      11
    )).toMatchSnapshot()
  })

  it("quote layout snapshot", () => {
    expect(composePrompt(
      { ...baseSlide, layout: "quote", mascot: false, accent: undefined, subtitle: undefined },
      baseBrandKit,
      11
    )).toMatchSnapshot()
  })

  it("renders correct badge text", () => {
    const out = composePrompt({ ...baseSlide, index: 7 }, baseBrandKit, 11)
    expect(out).toContain("\"7/11\"")
  })

  it("preserves Portuguese accents in title", () => {
    const out = composePrompt(baseSlide, baseBrandKit, 11)
    expect(out).toContain("Você não é um currículo")
  })

  it("omits accent line when accent is undefined", () => {
    const out = composePrompt({ ...baseSlide, accent: undefined }, baseBrandKit, 11)
    expect(out).not.toMatch(/Accent word/)
  })

  it("omits subtitle line when subtitle is undefined", () => {
    const out = composePrompt({ ...baseSlide, subtitle: undefined }, baseBrandKit, 11)
    expect(out).not.toMatch(/^- Subtitle:/m)
  })

  it("includes mascot instruction when mascot is true", () => {
    const out = composePrompt(baseSlide, baseBrandKit, 11)
    expect(out).toMatch(/include the (?:blue blob )?mascot/i)
  })

  it("includes 'do not include mascot' when mascot is false", () => {
    const out = composePrompt({ ...baseSlide, mascot: false }, baseBrandKit, 11)
    expect(out).toMatch(/do not include mascot/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test lib/prompt.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/prompt.ts`**

```ts
import type { SlideSpec, SlideLayout } from "./schema"

export type BrandKitMeta = {
  primaryHex: string
  accentHex: string
}

const LAYOUT_DESCRIPTIONS: Record<SlideLayout, string> = {
  centered_text:
    "All text centered both vertically and horizontally with generous whitespace. If a mascot is included, place it small below the subtitle.",
  mascot_hero:
    "Mascot occupies the bottom 40% of the frame, large and prominent. Title and subtitle stacked above the mascot with center alignment.",
  icon_list:
    "Subtitle area is rendered as a vertical list with 3-4 short items. Each item has a small flat icon on the left (pick from: trophy, bar chart, dollar coin, warning sign, sparkle, target) and a short label on the right. Mascot small in the bottom-right corner.",
  mock_ui:
    "Embed a stylized rounded-corner UI screenshot in the right half of the frame (a dashboard chart, radar plot, data table, or settings panel — see EXTRAS for which). Title and subtitle stacked on the left half, vertically centered.",
  quote:
    "Render the title as a large centered quotation with curly quote marks (open at top-left of text, close at bottom-right). Minimal whitespace usage, no decorative elements other than the background. No mascot."
}

const renderTextBlock = (slide: SlideSpec): string => {
  const lines = [`- Title: "${slide.title}"`]
  if (slide.accent) lines.push(`- Accent word inside title (color in vivid blue, hex like the accent in references): "${slide.accent}"`)
  if (slide.subtitle) lines.push(`- Subtitle: "${slide.subtitle}"`)
  return lines.join("\n")
}

const renderMascot = (mascot: boolean): string =>
  mascot
    ? "Include the blue blob mascot from the reference image. Match its proportions, face, and pose family exactly."
    : "Do not include mascot."

const renderExtras = (extras: string | undefined): string =>
  extras ? `EXTRAS: ${extras}` : "EXTRAS: (none)"

export const composePrompt = (slide: SlideSpec, brandKit: BrandKitMeta, total: number): string => `Create a 1080×1080 Instagram carousel slide.

VISUAL STYLE — match reference images exactly:
- Soft blue gradient background with abstract organic blob shapes (white and very light blue)
- Subtle decorative dot pattern in the background
- Bold modern sans-serif typography in dark navy (close to ${brandKit.primaryHex})
- Accent words rendered in vivid blue (close to ${brandKit.accentHex})
- Rounded friendly aesthetic, ~80px padding from edges
- 1080×1080 square framing

BADGE: small rounded pill in the top-left corner with the exact text "${slide.index}/${total}". White-on-blue or blue-on-white, matching reference badges.

LAYOUT: ${LAYOUT_DESCRIPTIONS[slide.layout]}

TEXT — render verbatim, preserve Portuguese accents and punctuation, no paraphrasing:
${renderTextBlock(slide)}

MASCOT: ${renderMascot(slide.mascot)}

${renderExtras(slide.extras)}

Reference images attached: brand mascot, sample slides, color swatch.`
```

- [ ] **Step 4: Run tests to verify they pass and accept snapshots**

```bash
pnpm test lib/prompt.test.ts
```
Expected: PASS — first run writes snapshot files. Re-run to confirm stability:
```bash
pnpm test lib/prompt.test.ts
```
Expected: PASS — all 11 tests passing on second run.

- [ ] **Step 5: Commit**

```bash
git add lib/prompt.ts lib/prompt.test.ts lib/__snapshots__
git commit -m "feat(lib): composePrompt with 5 layouts and snapshot tests"
```

---

### Task 6: `lib/zip.ts` — Client-side ZIP bundler

**Files:**
- Create: `~/projects/carousel-studio/lib/zip.ts`
- Create: `~/projects/carousel-studio/lib/zip.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/zip.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { buildCarouselZip } from "./zip"

const fakePngBase64 = (color: number) => {
  const bytes = new Uint8Array([color, color, color, 255])
  return Buffer.from(bytes).toString("base64")
}

describe("buildCarouselZip", () => {
  it("packages N base64 PNGs as slide-XX.png entries", async () => {
    const slides = [
      { index: 1, base64: fakePngBase64(10) },
      { index: 2, base64: fakePngBase64(20) }
    ]
    const blob = await buildCarouselZip(slides, "test-topic")
    expect(blob).toBeInstanceOf(Blob)

    const buffer = Buffer.from(await blob.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)
    expect(Object.keys(zip.files).sort()).toEqual(["slide-01.png", "slide-02.png"])
  })

  it("zero-pads index correctly for 11 slides", async () => {
    const slides = Array.from({ length: 11 }, (_, i) => ({
      index: i + 1,
      base64: fakePngBase64(i)
    }))
    const blob = await buildCarouselZip(slides, "topic")
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
    expect(zip.files["slide-01.png"]).toBeDefined()
    expect(zip.files["slide-11.png"]).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test lib/zip.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/zip.ts`**

```ts
import JSZip from "jszip"

export type ZipSlide = {
  index: number
  base64: string
}

const padIndex = (n: number): string => String(n).padStart(2, "0")

export const buildCarouselZip = async (slides: ZipSlide[], _topic: string): Promise<Blob> => {
  const zip = new JSZip()
  for (const slide of slides) {
    zip.file(`slide-${padIndex(slide.index)}.png`, slide.base64, { base64: true })
  }
  return zip.generateAsync({ type: "blob" })
}

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

> The `_topic` param is unused inside the zip itself but is part of the public signature so callers can pass it without an extra branch. Filename is built by the caller with `${topic}-${YYYY-MM-DD}.zip`.

> `downloadBlob` only runs in the browser — it has no test (jsdom not configured). It's exercised manually in Task 14.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test lib/zip.test.ts
```
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/zip.ts lib/zip.test.ts
git commit -m "feat(lib): JSZip carousel bundler with zero-padded slide names"
```

---

### Task 7: `lib/brand-kit.ts` — Brand kit type and storage helpers

**Files:**
- Create: `~/projects/carousel-studio/lib/brand-kit.ts`
- Create: `~/projects/carousel-studio/lib/brand-kit.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/brand-kit.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { BrandKitSchema, isComplete } from "./brand-kit"

describe("BrandKitSchema", () => {
  it("accepts a complete brand kit", () => {
    const kit = {
      mascotBase64: "abc",
      sampleSlidesBase64: ["xyz"],
      primaryHex: "#1a2745",
      accentHex: "#2d7eff"
    }
    expect(BrandKitSchema.safeParse(kit).success).toBe(true)
  })

  it("rejects invalid hex color", () => {
    const kit = {
      mascotBase64: "abc",
      sampleSlidesBase64: [],
      primaryHex: "navy",
      accentHex: "#2d7eff"
    }
    expect(BrandKitSchema.safeParse(kit).success).toBe(false)
  })

  it("allows empty sample slides", () => {
    const kit = {
      mascotBase64: "abc",
      sampleSlidesBase64: [],
      primaryHex: "#1a2745",
      accentHex: "#2d7eff"
    }
    expect(BrandKitSchema.safeParse(kit).success).toBe(true)
  })

  it("rejects more than 3 sample slides", () => {
    const kit = {
      mascotBase64: "abc",
      sampleSlidesBase64: ["a", "b", "c", "d"],
      primaryHex: "#1a2745",
      accentHex: "#2d7eff"
    }
    expect(BrandKitSchema.safeParse(kit).success).toBe(false)
  })
})

describe("isComplete", () => {
  it("returns true for valid kit", () => {
    expect(isComplete({
      mascotBase64: "abc",
      sampleSlidesBase64: [],
      primaryHex: "#1a2745",
      accentHex: "#2d7eff"
    })).toBe(true)
  })
  it("returns false for null", () => {
    expect(isComplete(null)).toBe(false)
  })
  it("returns false for empty mascot", () => {
    expect(isComplete({
      mascotBase64: "",
      sampleSlidesBase64: [],
      primaryHex: "#1a2745",
      accentHex: "#2d7eff"
    })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test lib/brand-kit.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/brand-kit.ts`**

```ts
import { z } from "zod"

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #RRGGBB hex")

export const BrandKitSchema = z.object({
  mascotBase64: z.string().min(1),
  sampleSlidesBase64: z.array(z.string().min(1)).max(3),
  primaryHex: HexColorSchema,
  accentHex: HexColorSchema
})

export type BrandKit = z.infer<typeof BrandKitSchema>

const STORAGE_KEY = "carouselStudio.brandKit"

export const isComplete = (kit: unknown): kit is BrandKit => {
  return BrandKitSchema.safeParse(kit).success
}

export const loadBrandKit = (): BrandKit | null => {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return isComplete(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const saveBrandKit = (kit: BrandKit): void => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kit))
}

export const clearBrandKit = (): void => {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(STORAGE_KEY)
}

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") return reject(new Error("FileReader returned non-string"))
      const comma = result.indexOf(",")
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test lib/brand-kit.test.ts
```
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/brand-kit.ts lib/brand-kit.test.ts
git commit -m "feat(lib): brand kit schema and localStorage helpers"
```

---

## Chunk 3: External Integration

### Task 8: `lib/openai.ts` — gpt-image-2 wrapper

**Files:**
- Create: `~/projects/carousel-studio/lib/openai.ts`
- Create: `~/projects/carousel-studio/lib/openai.test.ts`

- [ ] **Step 1: Write the failing test (mocked SDK)**

`lib/openai.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const editMock = vi.fn()

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      images: { edit: editMock }
    })),
    toFile: vi.fn(async (input: Buffer) => ({ kind: "file", input }))
  }
})

import { generateSlideImage } from "./openai"

describe("generateSlideImage", () => {
  beforeEach(() => editMock.mockReset())

  it("calls images.edit with model gpt-image-2 and returns base64", async () => {
    editMock.mockResolvedValue({ data: [{ b64_json: "fakebase64" }] })
    const result = await generateSlideImage({
      prompt: "test prompt",
      referenceImageBuffers: [Buffer.from([1, 2, 3])],
      quality: "high",
      size: "1024x1024"
    })
    expect(result).toBe("fakebase64")
    expect(editMock).toHaveBeenCalledTimes(1)
    const call = editMock.mock.calls[0][0]
    expect(call.model).toBe("gpt-image-2")
    expect(call.prompt).toBe("test prompt")
    expect(call.quality).toBe("high")
    expect(call.size).toBe("1024x1024")
    expect(Array.isArray(call.image)).toBe(true)
    expect(call.image.length).toBe(1)
  })

  it("throws when API returns no image", async () => {
    editMock.mockResolvedValue({ data: [] })
    await expect(generateSlideImage({
      prompt: "p",
      referenceImageBuffers: [Buffer.from([])],
      quality: "high",
      size: "1024x1024"
    })).rejects.toThrow(/no image/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test lib/openai.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/openai.ts`**

```ts
import OpenAI, { toFile } from "openai"

export type GenerateSlideArgs = {
  prompt: string
  referenceImageBuffers: Buffer[]
  quality: "low" | "medium" | "high"
  size: "1024x1024" | "4096x4096"
}

const getClient = (() => {
  let cached: OpenAI | null = null
  return (): OpenAI => {
    if (cached) return cached
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error("OPENAI_API_KEY env var is not set")
    cached = new OpenAI({ apiKey })
    return cached
  }
})()

export const generateSlideImage = async (args: GenerateSlideArgs): Promise<string> => {
  const files = await Promise.all(
    args.referenceImageBuffers.map((buf, i) =>
      toFile(buf, `ref-${i}.png`, { type: "image/png" })
    )
  )

  const response = await getClient().images.edit({
    model: "gpt-image-2",
    image: files,
    prompt: args.prompt,
    quality: args.quality,
    size: args.size
  })

  const first = response.data?.[0]
  if (!first?.b64_json) throw new Error("OpenAI returned no image data")
  return first.b64_json
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test lib/openai.test.ts
```
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/openai.ts lib/openai.test.ts
git commit -m "feat(lib): gpt-image-2 wrapper with reference-image support"
```

---

### Task 9: `lib/swatch.ts` — Color swatch image generator

**Files:**
- Create: `~/projects/carousel-studio/lib/swatch.ts`
- Create: `~/projects/carousel-studio/lib/swatch.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/swatch.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { renderColorSwatch } from "./swatch"

describe("renderColorSwatch", () => {
  it("returns a non-empty PNG buffer", async () => {
    const buf = await renderColorSwatch("#1a2745", "#2d7eff")
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(50)
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
  })

  it("rejects invalid hex", async () => {
    await expect(renderColorSwatch("not-a-hex", "#2d7eff")).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test lib/swatch.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `lib/swatch.ts`**

```ts
import sharp from "sharp"

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`invalid hex: ${hex}`)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

export const renderColorSwatch = async (primaryHex: string, accentHex: string): Promise<Buffer> => {
  const primary = hexToRgb(primaryHex)
  const accent = hexToRgb(accentHex)

  const halfWidth = 256
  const height = 512

  const left = await sharp({
    create: { width: halfWidth, height, channels: 3, background: primary }
  }).png().toBuffer()

  const right = await sharp({
    create: { width: halfWidth, height, channels: 3, background: accent }
  }).png().toBuffer()

  return sharp({
    create: { width: halfWidth * 2, height, channels: 3, background: { r: 0, g: 0, b: 0 } }
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: halfWidth, top: 0 }
    ])
    .png()
    .toBuffer()
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test lib/swatch.test.ts
```
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/swatch.ts lib/swatch.test.ts
git commit -m "feat(lib): server-side color swatch PNG generator via sharp"
```

---

### Task 10: API route `POST /api/generate` (SSE bulk)

**Files:**
- Create: `~/projects/carousel-studio/app/api/generate/route.ts`
- Create: `~/projects/carousel-studio/lib/generate-runner.ts`
- Create: `~/projects/carousel-studio/lib/generate-runner.test.ts`

- [ ] **Step 1: Write the failing test for the runner**

`lib/generate-runner.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const generateSlideImageMock = vi.fn()
vi.mock("./openai", () => ({ generateSlideImage: generateSlideImageMock }))
vi.mock("./swatch", () => ({ renderColorSwatch: vi.fn(async () => Buffer.from([0])) }))

import { runCarouselGeneration } from "./generate-runner"
import type { CarouselInput } from "./schema"

const baseInput: CarouselInput = {
  topic: "t",
  total: 3,
  slides: [
    { index: 1, title: "a", mascot: false, layout: "quote" },
    { index: 2, title: "b", mascot: false, layout: "quote" },
    { index: 3, title: "c", mascot: false, layout: "quote" }
  ]
}

const baseBrandKit = {
  mascotBase64: Buffer.from("mascot").toString("base64"),
  sampleSlidesBase64: [],
  primaryHex: "#1a2745",
  accentHex: "#2d7eff"
}

describe("runCarouselGeneration", () => {
  beforeEach(() => generateSlideImageMock.mockReset())

  it("emits one event per slide on success", async () => {
    generateSlideImageMock.mockImplementation(async () => "b64data")
    const events: unknown[] = []
    await runCarouselGeneration({
      input: baseInput,
      brandKit: baseBrandKit,
      quality: "high",
      onEvent: (e) => events.push(e)
    })
    expect(events).toHaveLength(3)
    expect(events.every((e: any) => e.kind === "slide")).toBe(true)
    expect(events.map((e: any) => e.index).sort()).toEqual([1, 2, 3])
  })

  it("emits error event for failed slide without aborting siblings", async () => {
    generateSlideImageMock.mockImplementation(async ({ prompt }: { prompt: string }) => {
      if (prompt.includes("\"2/3\"")) throw new Error("boom")
      return "b64data"
    })
    const events: any[] = []
    await runCarouselGeneration({
      input: baseInput,
      brandKit: baseBrandKit,
      quality: "high",
      onEvent: (e) => events.push(e)
    })
    expect(events).toHaveLength(3)
    const errored = events.find((e) => e.kind === "error")
    expect(errored?.index).toBe(2)
    expect(events.filter((e) => e.kind === "slide")).toHaveLength(2)
  })

  it("respects concurrency cap of 4", async () => {
    let inFlight = 0
    let peak = 0
    generateSlideImageMock.mockImplementation(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 10))
      inFlight--
      return "b64data"
    })
    const tenSlides: CarouselInput = {
      topic: "t",
      total: 10,
      slides: Array.from({ length: 10 }, (_, i) => ({
        index: i + 1, title: "x", mascot: false, layout: "quote" as const
      }))
    }
    await runCarouselGeneration({
      input: tenSlides,
      brandKit: baseBrandKit,
      quality: "high",
      onEvent: () => {}
    })
    expect(peak).toBeLessThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test lib/generate-runner.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `lib/generate-runner.ts`**

```ts
import { generateSlideImage } from "./openai"
import { renderColorSwatch } from "./swatch"
import { composePrompt } from "./prompt"
import { qualityToApiParams, type QualityChoice } from "./cost"
import type { CarouselInput, SlideSpec } from "./schema"
import type { BrandKit } from "./brand-kit"

export type RunEvent =
  | { kind: "slide"; index: number; base64: string }
  | { kind: "error"; index: number; message: string }

export type RunArgs = {
  input: CarouselInput
  brandKit: BrandKit
  quality: QualityChoice
  onEvent: (e: RunEvent) => void
}

const CONCURRENCY = 4

const buildReferenceBuffers = async (brandKit: BrandKit): Promise<Buffer[]> => {
  const mascot = Buffer.from(brandKit.mascotBase64, "base64")
  const samples = brandKit.sampleSlidesBase64.map((b) => Buffer.from(b, "base64"))
  const swatch = await renderColorSwatch(brandKit.primaryHex, brandKit.accentHex)
  return [mascot, ...samples, swatch]
}

const generateOne = async (
  slide: SlideSpec,
  total: number,
  brandKit: BrandKit,
  refs: Buffer[],
  apiParams: { quality: "low" | "medium" | "high"; size: "1024x1024" | "4096x4096" }
): Promise<string> => {
  const prompt = composePrompt(slide, brandKit, total)
  return generateSlideImage({
    prompt,
    referenceImageBuffers: refs,
    quality: apiParams.quality,
    size: apiParams.size
  })
}

const runWithRetry = async <T>(fn: () => Promise<T>, retries = 1): Promise<T> => {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    await new Promise((r) => setTimeout(r, 2000))
    return runWithRetry(fn, retries - 1)
  }
}

export const runCarouselGeneration = async (args: RunArgs): Promise<void> => {
  const refs = await buildReferenceBuffers(args.brandKit)
  const apiParams = qualityToApiParams(args.quality)

  const queue = [...args.input.slides]
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const slide = queue.shift()
      if (!slide) return
      try {
        const base64 = await runWithRetry(() =>
          generateOne(slide, args.input.total, args.brandKit, refs, apiParams)
        )
        args.onEvent({ kind: "slide", index: slide.index, base64 })
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error"
        args.onEvent({ kind: "error", index: slide.index, message })
      }
    }
  })
  await Promise.all(workers)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test lib/generate-runner.test.ts
```
Expected: PASS — 3 tests.

- [ ] **Step 5: Implement `app/api/generate/route.ts`**

```ts
import { NextRequest } from "next/server"
import { CarouselInputSchema } from "@/lib/schema"
import { BrandKitSchema } from "@/lib/brand-kit"
import { runCarouselGeneration, type RunEvent } from "@/lib/generate-runner"
import { z } from "zod"

const RequestSchema = z.object({
  input: CarouselInputSchema,
  brandKit: BrandKitSchema,
  quality: z.enum(["low", "medium", "high", "4k"])
})

export const POST = async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "content-type": "application/json" }
    })
  }

  const stream = new ReadableStream({
    start: async (controller) => {
      const encoder = new TextEncoder()
      const send = (event: RunEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        await runCarouselGeneration({ ...parsed.data, onEvent: send })
        controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`))
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error"
        controller.enqueue(encoder.encode(`event: fatal\ndata: ${JSON.stringify({ message })}\n\n`))
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive"
    }
  })
}
```

- [ ] **Step 6: Smoke test the route manually**

Set `OPENAI_API_KEY` in `.env.local`, then:
```bash
pnpm dev
```
In another terminal:
```bash
curl -N -X POST http://localhost:3000/api/generate \
  -H "content-type: application/json" \
  -d '{"input":{"topic":"t","total":1,"slides":[{"index":1,"title":"hi","mascot":false,"layout":"quote"}]},"brandKit":{"mascotBase64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","sampleSlidesBase64":[],"primaryHex":"#1a2745","accentHex":"#2d7eff"},"quality":"low"}'
```
Expected: SSE stream with one `data: {"kind":"slide",...}` line, followed by `event: done`. (Real OpenAI call — costs ~$0.01.)

Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add lib/generate-runner.ts lib/generate-runner.test.ts app/api/generate/route.ts
git commit -m "feat(api): /api/generate SSE route with concurrency-capped runner"
```

---

### Task 11: API route `POST /api/generate-single`

**Files:**
- Create: `~/projects/carousel-studio/app/api/generate-single/route.ts`

- [ ] **Step 1: Implement the route**

`app/api/generate-single/route.ts`:
```ts
import { NextRequest } from "next/server"
import { z } from "zod"
import { SlideSpecSchema } from "@/lib/schema"
import { BrandKitSchema } from "@/lib/brand-kit"
import { generateSlideImage } from "@/lib/openai"
import { renderColorSwatch } from "@/lib/swatch"
import { composePrompt } from "@/lib/prompt"
import { qualityToApiParams } from "@/lib/cost"

const RequestSchema = z.object({
  slide: SlideSpecSchema,
  total: z.number().int().min(1).max(20),
  brandKit: BrandKitSchema,
  quality: z.enum(["low", "medium", "high", "4k"])
})

export const POST = async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { slide, total, brandKit, quality } = parsed.data
  const apiParams = qualityToApiParams(quality)

  const refs = [
    Buffer.from(brandKit.mascotBase64, "base64"),
    ...brandKit.sampleSlidesBase64.map((b) => Buffer.from(b, "base64")),
    await renderColorSwatch(brandKit.primaryHex, brandKit.accentHex)
  ]

  try {
    const base64 = await generateSlideImage({
      prompt: composePrompt(slide, brandKit, total),
      referenceImageBuffers: refs,
      quality: apiParams.quality,
      size: apiParams.size
    })
    return Response.json({ index: slide.index, base64 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return Response.json({ index: slide.index, error: message }, { status: 502 })
  }
}
```

- [ ] **Step 2: Smoke test manually**

```bash
pnpm dev
```
In another terminal:
```bash
curl -X POST http://localhost:3000/api/generate-single \
  -H "content-type: application/json" \
  -d '{"slide":{"index":3,"title":"hi","mascot":false,"layout":"quote"},"total":11,"brandKit":{"mascotBase64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","sampleSlidesBase64":[],"primaryHex":"#1a2745","accentHex":"#2d7eff"},"quality":"low"}'
```
Expected: JSON `{"index":3,"base64":"<...>"}`. Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add app/api/generate-single/route.ts
git commit -m "feat(api): /api/generate-single for per-slide regeneration"
```

---

## Chunk 4: UI

### Task 12: `BrandKitPanel` component

**Files:**
- Create: `~/projects/carousel-studio/components/brand-kit-panel.tsx`

- [ ] **Step 1: Implement the component**

```tsx
"use client"

import { useState } from "react"
import { type BrandKit, fileToBase64 } from "@/lib/brand-kit"

type Props = {
  initial: BrandKit | null
  onSave: (kit: BrandKit) => void
  onCancel?: () => void
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export const BrandKitPanel = ({ initial, onSave, onCancel }: Props) => {
  const [mascotBase64, setMascotBase64] = useState(initial?.mascotBase64 ?? "")
  const [sampleSlidesBase64, setSampleSlides] = useState<string[]>(initial?.sampleSlidesBase64 ?? [])
  const [primaryHex, setPrimary] = useState(initial?.primaryHex ?? "#1a2745")
  const [accentHex, setAccent] = useState(initial?.accentHex ?? "#2d7eff")
  const [error, setError] = useState<string | null>(null)

  const handleMascot = async (file: File | undefined) => {
    if (!file) return
    setMascotBase64(await fileToBase64(file))
  }

  const handleSamples = async (files: FileList | null) => {
    if (!files) return
    const list = Array.from(files).slice(0, 3)
    const encoded = await Promise.all(list.map((f) => fileToBase64(f)))
    setSampleSlides(encoded)
  }

  const handleSubmit = () => {
    if (!mascotBase64) return setError("mascot reference required")
    if (!HEX_RE.test(primaryHex)) return setError("primary must be #RRGGBB")
    if (!HEX_RE.test(accentHex)) return setError("accent must be #RRGGBB")
    onSave({ mascotBase64, sampleSlidesBase64, primaryHex, accentHex })
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
      <h2 className="text-xl font-semibold">Brand kit</h2>

      <label className="block text-sm">
        <span className="opacity-70">Mascot reference (PNG)</span>
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => handleMascot(e.target.files?.[0])}
          className="mt-1 block w-full text-sm"
        />
        {mascotBase64 ? <span className="text-xs text-green-400">✓ loaded ({Math.round(mascotBase64.length * 0.75 / 1024)} KB)</span> : null}
      </label>

      <label className="block text-sm">
        <span className="opacity-70">Sample slides (1-3 PNGs)</span>
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg"
          onChange={(e) => handleSamples(e.target.files)}
          className="mt-1 block w-full text-sm"
        />
        <span className="text-xs opacity-60">{sampleSlidesBase64.length} loaded</span>
      </label>

      <div className="flex gap-4">
        <label className="block text-sm flex-1">
          <span className="opacity-70">Primary hex</span>
          <input value={primaryHex} onChange={(e) => setPrimary(e.target.value)} className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1 font-mono" />
        </label>
        <label className="block text-sm flex-1">
          <span className="opacity-70">Accent hex</span>
          <input value={accentHex} onChange={(e) => setAccent(e.target.value)} className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1 font-mono" />
        </label>
      </div>

      {error ? <div className="text-sm text-red-400">{error}</div> : null}

      <div className="flex gap-2">
        <button onClick={handleSubmit} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500">
          Save brand kit
        </button>
        {onCancel ? (
          <button onClick={onCancel} className="px-4 py-2 rounded bg-white/10 hover:bg-white/20">
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/brand-kit-panel.tsx
git commit -m "feat(ui): BrandKitPanel with file upload and hex color inputs"
```

---

### Task 13: `CarouselInput` component

**Files:**
- Create: `~/projects/carousel-studio/components/carousel-input.tsx`

- [ ] **Step 1: Implement the component**

```tsx
"use client"

import { useMemo } from "react"
import { CarouselInputSchema, type CarouselInput } from "@/lib/schema"
import { estimateCost, formatCost, type QualityChoice } from "@/lib/cost"

type Props = {
  value: string
  quality: QualityChoice
  onChangeValue: (raw: string) => void
  onChangeQuality: (q: QualityChoice) => void
  onGenerate: (input: CarouselInput) => void
}

const EXAMPLE = JSON.stringify({
  topic: "11 reasons your CV is dead",
  total: 2,
  slides: [
    { index: 1, title: "Você não é um currículo", accent: "currículo", subtitle: "Você é uma trajetória!", mascot: true, layout: "centered_text" },
    { index: 2, title: "Descubra o seu Link na bio!", accent: "Link na bio!", mascot: true, layout: "mascot_hero" }
  ]
}, null, 2)

export const CarouselInput = ({ value, quality, onChangeValue, onChangeQuality, onGenerate }: Props) => {
  const { parsed, errorMessage } = useMemo(() => {
    if (!value.trim()) return { parsed: null, errorMessage: null }
    try {
      const json = JSON.parse(value)
      const result = CarouselInputSchema.safeParse(json)
      if (result.success) return { parsed: result.data, errorMessage: null }
      const first = result.error.errors[0]
      return { parsed: null, errorMessage: `${first.path.join(".") || "(root)"}: ${first.message}` }
    } catch (err) {
      return { parsed: null, errorMessage: err instanceof Error ? err.message : "invalid JSON" }
    }
  }, [value])

  const cost = parsed ? estimateCost(parsed.total, quality) : 0

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Carousel input</h2>
        <button
          onClick={() => onChangeValue(EXAMPLE)}
          className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
        >
          Load example
        </button>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChangeValue(e.target.value)}
        placeholder="Paste your CarouselInput JSON here…"
        rows={20}
        className="w-full font-mono text-sm bg-black/40 border border-white/10 rounded p-3"
      />

      {errorMessage ? <div className="text-sm text-red-400">⚠ {errorMessage}</div> : null}

      <div className="flex items-end gap-4">
        <label className="block text-sm">
          <span className="opacity-70">Quality</span>
          <select
            value={quality}
            onChange={(e) => onChangeQuality(e.target.value as QualityChoice)}
            className="mt-1 block bg-black/40 border border-white/10 rounded px-2 py-1"
          >
            <option value="low">low (~$0.01)</option>
            <option value="medium">medium (~$0.04)</option>
            <option value="high">high (~$0.08) — recommended</option>
            <option value="4k">4K (~$0.41) — one-offs</option>
          </select>
        </label>

        <div className="flex-1 text-sm">
          {parsed ? (
            <span>
              {parsed.total} slides × {quality} = <strong>{formatCost(cost)}</strong>
            </span>
          ) : (
            <span className="opacity-50">cost shown after valid JSON</span>
          )}
        </div>

        <button
          onClick={() => parsed && onGenerate(parsed)}
          disabled={!parsed}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Generate
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/carousel-input.tsx
git commit -m "feat(ui): CarouselInput with JSON editor, live validation, cost preview"
```

---

### Task 14: `Gallery` and `SlideCard` components

**Files:**
- Create: `~/projects/carousel-studio/components/slide-card.tsx`
- Create: `~/projects/carousel-studio/components/gallery.tsx`

- [ ] **Step 1: Implement `slide-card.tsx`**

```tsx
"use client"

export type SlideState =
  | { kind: "pending"; index: number }
  | { kind: "ready"; index: number; base64: string }
  | { kind: "error"; index: number; message: string }
  | { kind: "regenerating"; index: number; previousBase64?: string }

type Props = {
  state: SlideState
  onRegenerate: (index: number) => void
}

const dataUrl = (base64: string) => `data:image/png;base64,${base64}`

export const SlideCard = ({ state, onRegenerate }: Props) => {
  const isPending = state.kind === "pending" || state.kind === "regenerating"
  const isError = state.kind === "error"
  const ready = state.kind === "ready" ? state : state.kind === "regenerating" ? { base64: state.previousBase64 } : null

  return (
    <div className={`rounded-lg border ${isError ? "border-red-500/40" : "border-white/10"} bg-black/30 overflow-hidden relative`}>
      <div className="aspect-square bg-white/5 flex items-center justify-center">
        {ready?.base64 ? (
          <img src={dataUrl(ready.base64)} alt={`slide ${state.index}`} className={`w-full h-full object-cover ${isPending ? "opacity-30" : ""}`} />
        ) : (
          <div className="text-xs opacity-40">slide {state.index}</div>
        )}
        {isPending ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm">generating…</div>
        ) : null}
      </div>
      <div className="px-3 py-2 flex items-center justify-between text-xs">
        <span className="opacity-70">slide {state.index}</span>
        {isError ? <span className="text-red-400 truncate">{state.message}</span> : null}
        <button
          onClick={() => onRegenerate(state.index)}
          disabled={isPending}
          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30"
        >
          {isError ? "Retry" : "Regen"}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement `gallery.tsx`**

```tsx
"use client"

import { SlideCard, type SlideState } from "./slide-card"
import { buildCarouselZip, downloadBlob } from "@/lib/zip"

type Props = {
  slides: SlideState[]
  topic: string
  onRegenerate: (index: number) => void
}

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const sanitize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "carousel"

export const Gallery = ({ slides, topic, onRegenerate }: Props) => {
  const ready = slides.filter((s): s is Extract<SlideState, { kind: "ready" }> => s.kind === "ready")
  const canDownload = ready.length > 0 && ready.length === slides.length

  const handleDownload = async () => {
    const blob = await buildCarouselZip(
      ready.map((s) => ({ index: s.index, base64: s.base64 })),
      topic
    )
    downloadBlob(blob, `${sanitize(topic)}-${today()}.zip`)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gallery</h2>
        <button
          onClick={handleDownload}
          disabled={!canDownload}
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Download ZIP ({ready.length}/{slides.length})
        </button>
      </div>

      {slides.length === 0 ? (
        <div className="text-sm opacity-50">No slides yet. Hit Generate.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {slides.map((s) => (
            <SlideCard key={s.index} state={s} onRegenerate={onRegenerate} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify compilation**

```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/slide-card.tsx components/gallery.tsx
git commit -m "feat(ui): SlideCard and Gallery with zip download"
```

---

### Task 15: Wire it all together in `app/page.tsx`

**Files:**
- Modify: `~/projects/carousel-studio/app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx` with the wired-up version**

```tsx
"use client"

import { useEffect, useState } from "react"
import { BrandKitPanel } from "@/components/brand-kit-panel"
import { CarouselInput as CarouselInputForm } from "@/components/carousel-input"
import { Gallery } from "@/components/gallery"
import type { SlideState } from "@/components/slide-card"
import { type BrandKit, loadBrandKit, saveBrandKit } from "@/lib/brand-kit"
import type { CarouselInput } from "@/lib/schema"
import type { QualityChoice } from "@/lib/cost"

const INPUT_KEY = "carouselStudio.lastInput"

const Page = () => {
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null)
  const [editingBrandKit, setEditing] = useState(false)
  const [inputRaw, setInputRaw] = useState("")
  const [quality, setQuality] = useState<QualityChoice>("high")
  const [slides, setSlides] = useState<SlideState[]>([])
  const [topic, setTopic] = useState("")
  const [activeInput, setActiveInput] = useState<CarouselInput | null>(null)

  useEffect(() => {
    setBrandKit(loadBrandKit())
    const saved = window.localStorage.getItem(INPUT_KEY)
    if (saved) setInputRaw(saved)
  }, [])

  useEffect(() => {
    if (inputRaw) window.localStorage.setItem(INPUT_KEY, inputRaw)
  }, [inputRaw])

  const handleSaveBrandKit = (kit: BrandKit) => {
    saveBrandKit(kit)
    setBrandKit(kit)
    setEditing(false)
  }

  const handleGenerate = async (input: CarouselInput) => {
    if (!brandKit) return
    setActiveInput(input)
    setTopic(input.topic)
    setSlides(input.slides.map((s) => ({ kind: "pending", index: s.index })))

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, brandKit, quality })
    })
    if (!response.body) return

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    const handleEvent = (raw: string) => {
      const dataLine = raw.split("\n").find((l) => l.startsWith("data: "))
      if (!dataLine) return
      try {
        const event = JSON.parse(dataLine.slice(6))
        setSlides((prev) =>
          prev.map((p) =>
            p.index === event.index
              ? event.kind === "slide"
                ? { kind: "ready", index: event.index, base64: event.base64 }
                : { kind: "error", index: event.index, message: event.message }
              : p
          )
        )
      } catch {}
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split("\n\n")
      buffer = events.pop() ?? ""
      events.forEach(handleEvent)
    }
  }

  const handleRegenerate = async (index: number) => {
    if (!brandKit || !activeInput) return
    const slide = activeInput.slides.find((s) => s.index === index)
    if (!slide) return
    setSlides((prev) =>
      prev.map((p) =>
        p.index === index
          ? { kind: "regenerating", index, previousBase64: p.kind === "ready" ? p.base64 : undefined }
          : p
      )
    )
    const response = await fetch("/api/generate-single", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slide, total: activeInput.total, brandKit, quality })
    })
    const data = await response.json()
    setSlides((prev) =>
      prev.map((p) =>
        p.index === index
          ? data.error
            ? { kind: "error", index, message: data.error }
            : { kind: "ready", index, base64: data.base64 }
          : p
      )
    )
  }

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Carousel Studio</h1>
        {brandKit && !editingBrandKit ? (
          <button onClick={() => setEditing(true)} className="text-sm px-3 py-1 rounded bg-white/10 hover:bg-white/20">
            Edit brand kit
          </button>
        ) : null}
      </header>

      {!brandKit || editingBrandKit ? (
        <BrandKitPanel
          initial={brandKit}
          onSave={handleSaveBrandKit}
          onCancel={editingBrandKit ? () => setEditing(false) : undefined}
        />
      ) : (
        <>
          <CarouselInputForm
            value={inputRaw}
            quality={quality}
            onChangeValue={setInputRaw}
            onChangeQuality={setQuality}
            onGenerate={handleGenerate}
          />
          <Gallery slides={slides} topic={topic} onRegenerate={handleRegenerate} />
        </>
      )}
    </main>
  )
}

export default Page
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(app): wire brand kit, input, gallery, SSE streaming, regen flow"
```

---

## Chunk 5: Polish

### Task 16: README and full smoke test

**Files:**
- Create: `~/projects/carousel-studio/README.md`

- [ ] **Step 1: Write the README**

```markdown
# Carousel Studio

Local micro-app to generate brand-consistent Instagram carousel images on `gpt-image-2`.

## Run

```bash
pnpm install
cp .env.example .env.local           # then add your OPENAI_API_KEY
pnpm dev                              # opens http://localhost:3000
```

## Use

1. **Brand kit** — first run prompts you to upload mascot PNG + 1–3 sample slides + 2 hex colors. Stored in `localStorage`.
2. **Input** — paste a `CarouselInput` JSON (use **Load example** button as a template). Live validation.
3. **Quality** — pick `high` (default). `4K` only when you'll crop or zoom.
4. **Generate** — see the cost, click. Slides stream in as they're ready.
5. **Regen** — click any slide's "Regen" button to redo it.
6. **Download ZIP** — once all slides are ready, downloads `<topic>-<date>.zip`.

## CarouselInput shape

See `lib/schema.ts`. Layouts:
- `centered_text` — text centered, optional small mascot below
- `mascot_hero` — big mascot bottom 40%, text above
- `icon_list` — vertical icon list (use `extras` to specify items)
- `mock_ui` — UI screenshot right, text left (use `extras` for the screenshot description)
- `quote` — large centered quote, no mascot

## Test

```bash
pnpm test
```

## Notes

- Single-user, local-only. Do not deploy as-is — there's no auth.
- API key never reaches the browser; all OpenAI calls happen in Next.js route handlers.
- Cost is published rate at the time of writing; `lib/cost.ts` is the source of truth.
```

- [ ] **Step 2: Run the full test suite**

```bash
pnpm test
```
Expected: all tests pass (~30 across schema, cost, prompt, zip, brand-kit, openai, swatch, generate-runner).

- [ ] **Step 3: Run typecheck**

```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: End-to-end smoke test in the browser**

Add a real `OPENAI_API_KEY` to `.env.local`. Then:
```bash
pnpm dev
```
- Open `http://localhost:3000`
- Upload a mascot PNG + 1 sample slide + set hex colors → Save brand kit
- Click **Load example** → JSON populates → Quality: `low` (cheap smoke test)
- Click **Generate** → watch 2 slides stream in
- Click **Regen** on slide 1 → see it replace
- Click **Download ZIP** → file saves with 2 PNGs inside
- Open the PNGs — sanity check that they're recognizable Instagram-style slides

If any step fails, fix it now before committing.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README with setup, usage, and architecture notes"
```

- [ ] **Step 6: Final manual carousel run (optional, billed)**

Run a real 11-slide carousel at `high` quality (~$1) to confirm the prompt template produces Instagram-grade output. If a layout disappoints, edit `lib/prompt.ts:LAYOUT_DESCRIPTIONS` and re-run that single slide. Snapshot tests will fail on prompt changes — update snapshots with `pnpm test -- -u`.

---

## Done criteria

- All tests green (`pnpm test`)
- Typecheck clean (`pnpm exec tsc --noEmit`)
- 2-slide smoke test produces valid PNGs end-to-end
- ZIP download works
- Regenerate-single replaces a slide in place
- Brand kit persists across page reloads
