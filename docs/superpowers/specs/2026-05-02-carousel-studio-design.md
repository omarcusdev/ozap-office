# Carousel Studio — Design Spec

**Date:** 2026-05-02
**Type:** Tool (standalone Next.js app, single-user v1)
**Status:** Spec approved, ready for implementation plan

---

## 1. Summary

**Working name:** `carousel-studio`
**What it is:** A local micro-app that turns structured slide copy into a brand-consistent Instagram carousel (1080×1080 PNGs) using OpenAI `gpt-image-2`. Designed for Marcus to draft Instagram carousels for AI Office (and future products) in minutes instead of hours.
**Who uses it (v1):** Marcus only, running locally on his laptop. No deploy, no auth, no multi-tenancy.
**Promise:** Paste structured JSON → click Generate → download a ZIP of N polished, brand-consistent slides ready to upload to Instagram.

---

## 2. Goals & non-goals

**Goals**
- Generate full carousels (up to 20 slides) in a single bulk run
- Brand consistency across slides via reference images attached to every generation
- Fast iteration: regenerate any single slide without redoing the whole carousel
- Cost transparency: estimated cost shown before every run
- Pure-text input (JSON) — no design tools, no drag-and-drop layout

**Non-goals (v1)**
- Multi-user, auth, hosted deployment
- Database / project history / past-carousel browser
- LLM-driven copy generation (Marcus writes copy by hand — copy is the value)
- Instagram API publishing (manual upload)
- Video / Reels output
- Custom font upload (gpt-image-2 infers fonts from reference images)
- Visual prompt editor (the prompt template is a TypeScript file — that *is* the editor)

---

## 3. Architecture

**Stack**
- Next.js 15 (App Router) + React 19 + TypeScript + Tailwind v4
- Single Next.js process: browser ↔ Next.js API routes ↔ OpenAI

**Topology**
```
[Browser]  ──(POST /api/generate)──>  [Next.js API route]  ──>  [OpenAI gpt-image-2]
   ▲                                          │
   │                          (Server-Sent Events stream of slides)
   └──────────────────────────────────────────┘
```

**Persistence**
- `localStorage` only:
  - `brandKit` — base64-encoded mascot reference + 1–3 sample slides + 2 hex colors
  - `lastInput` — last-edited JSON input (so refresh doesn't lose work)
- No database, no server-side persistence
- Generated images live in browser memory until ZIP download

**Auth**
- None. Runs on `localhost:3000` via `pnpm dev`. Single user on single machine.

**Secrets**
- `OPENAI_API_KEY` in `.env.local`. Read server-side only — never exposed to browser.

**Repo**
- New repo (separate from `ozap-office`). No monorepo coupling.

---

## 4. File layout

```
carousel-studio/
├── app/
│   ├── page.tsx                     # main shell: brand-kit panel + input + gallery
│   ├── layout.tsx                   # Tailwind + global styles
│   └── api/
│       ├── generate/route.ts        # POST: bulk generate (SSE)
│       └── generate-single/route.ts # POST: regenerate one slide
├── lib/
│   ├── prompt.ts                    # pure: composePrompt(slide, brandKit) → string
│   ├── openai.ts                    # gpt-image-2 client wrapper
│   ├── brand-kit.ts                 # localStorage helpers + ref image encoding
│   ├── schema.ts                    # Zod schemas for input validation
│   ├── cost.ts                      # cost estimator (quality × resolution × N)
│   └── zip.ts                       # client-side ZIP bundling (JSZip)
├── components/
│   ├── brand-kit-panel.tsx          # mascot upload + hex inputs
│   ├── carousel-input.tsx           # JSON editor (textarea + inline Zod errors)
│   ├── gallery.tsx                  # grid of slide cards + download-zip btn
│   └── slide-card.tsx               # individual slide preview + retry/regen btns
├── lib/prompt.test.ts               # snapshot tests per layout
├── .env.local
├── .env.example
├── package.json
└── README.md
```

**Isolation principles**
- `lib/prompt.ts` is a **pure function** — no I/O, no async. Testable, easy to iterate.
- `lib/openai.ts` is the only file that knows about gpt-image-2 specifics. Swap models = one file change.
- API routes are thin coordinators: validate → compose → call → stream.
- All client state lives in `app/page.tsx` (small enough not to need Zustand).

---

## 5. Data flow (happy path)

1. Browser loads `/`. Reads `brandKit` from localStorage.
   - If absent → render `<BrandKitPanel>` setup form first.
2. User pastes/edits JSON in `<CarouselInput>`. Live Zod validation, errors shown inline.
3. User selects quality (low / medium / high / 4K). Default: `high` at 1024×1024.
4. App computes cost estimate from `lib/cost.ts`. Shows: *"11 slides × high @ 1024 = ~$X.XX"* (computed live).
5. User clicks **Generate**. Confirmation modal, then POST `/api/generate` with `{ input, brandKit, quality }`.
6. API route:
   - Validates input again (Zod, server-side).
   - For each slide, calls `composePrompt(slide, brandKit)`.
   - Fires gpt-image-2 calls with **concurrency cap of 4** (`p-limit` or hand-rolled).
   - Streams each completed slide back via Server-Sent Events: `data: { index, image: "<base64>" }`.
   - On per-slide failure, streams `data: { index, error: "..." }` — does not abort siblings.
7. `<Gallery>` listens to the stream, renders each slide as it arrives.
8. User clicks any slide → "Regenerate" → POST `/api/generate-single` with that slide's spec → replaces the slide in place.
9. User clicks **Download ZIP** → client-side JSZip bundles all slides as PNGs → `{topic}-{YYYY-MM-DD}.zip`.

---

## 6. Input schema

```ts
type CarouselInput = {
  topic: string                  // used for ZIP filename + run identification
  total: number                  // total slide count, e.g., 11
  slides: SlideSpec[]            // length should equal total
}

type SlideSpec = {
  index: number                  // 1-based; rendered as "{index}/{total}" badge
  title: string                  // main headline text, rendered verbatim
  accent?: string                // word/phrase inside title rendered in accent color
  subtitle?: string              // secondary text under title
  mascot: boolean                // include the brand mascot in the composition
  layout: SlideLayout            // see below
  extras?: string                // freeform hint for unusual slides (e.g., "list: A, B, C")
}

type SlideLayout =
  | "centered_text"   // all text centered, optional mascot below subtitle
  | "mascot_hero"     // mascot fills bottom 40%, text stacked above
  | "icon_list"       // subtitle area is a 3-4 item list with icons; small mascot bottom-right
  | "mock_ui"         // stylized UI screenshot (chart/radar/table) embedded right; text left
  | "quote"           // large quote text centered with quotation marks; no mascot
```

**Validation rules (Zod)**
- `slides.length === total`
- `slides[i].index` strictly increasing 1..total, no gaps
- `total ≤ 20` (hard cap)
- `title.length ≤ 80`, `subtitle.length ≤ 200`, `extras.length ≤ 300`
- `layout` ∈ enum

---

## 7. Prompt template

`lib/prompt.ts` exports a single function:

```ts
export function composePrompt(slide: SlideSpec, brandKit: BrandKit, total: number): string
```

**Template skeleton** (truncated; see implementation):

```
Create a 1080×1080 Instagram carousel slide.

VISUAL STYLE — match reference images exactly:
- Soft blue gradient background with abstract organic blob shapes (white/light blue)
- Subtle decorative dot pattern in background
- Bold modern sans-serif typography, dark navy
- Accent words rendered in vivid blue
- Rounded friendly aesthetic, ~80px padding from edges

BADGE: small rounded pill in top-left corner with exact text "{index}/{total}".

LAYOUT: {layout-specific paragraph from LAYOUT_DESCRIPTIONS}

TEXT — render verbatim, preserve Portuguese accents, no paraphrasing:
- Title: "{title}"
- Accent word (color in vivid blue): "{accent}"
- Subtitle: "{subtitle}"

MASCOT: {include the blue blob mascot from reference image / do not include mascot}

EXTRAS: {extras}

Reference images attached: brand mascot, sample slides, color palette.
```

**Layout descriptions** are constants in `lib/prompt.ts`:
- `centered_text`: All text centered vertically and horizontally. Generous whitespace. Optional mascot beneath subtitle.
- `mascot_hero`: Mascot occupies bottom ~40% of frame, large and prominent. Title + subtitle stacked above with center alignment.
- `icon_list`: Subtitle area renders as a vertical list with 3–4 items. Each item has a small flat icon (trophy, chart, dollar, warning) on the left and short label on the right. Mascot small in bottom-right corner.
- `mock_ui`: Embed a stylized rounded-corner UI screenshot (dashboard chart, radar plot, or data table) in the right half. Title and subtitle stacked on the left half.
- `quote`: Large quotation text centered with curly quotation marks. Minimal, no mascot.

**References sent on every call**: brand-kit mascot reference + 1–3 sample carousel slides + a small color-swatch image rendered server-side from the two hex codes (so the model sees exact colors, not just hex strings in text). 3–5 references total, well under the API's 16 cap.

---

## 8. Brand kit

**One-time setup** (`<BrandKitPanel>`):
- Drag-drop or file-pick mascot reference (PNG preferred, JPG OK; max 2 MB)
- Drag-drop 1–3 sample carousel slides (existing AI Office images work fine)
- Two hex color inputs: primary (text) + accent (highlighted words)

**Storage**: base64-encoded into a single localStorage key `carouselStudio.brandKit`.

**Editing**: "Edit brand kit" button on main screen reopens the panel; submit overwrites the localStorage value.

**Sent to OpenAI**: brand-kit images are passed as `reference_images` in the gpt-image-2 request. Up to 16 supported by the API; we send **3–5 references total**: 1 mascot + 1–3 sample slides + 1 color swatch. The color swatch is rendered at request time on the server from the two hex codes (a tiny `<canvas>`-equivalent in Node, e.g., `sharp` or a base64-PNG built by hand) so the model sees the exact colors rather than just hex strings in text.

---

## 9. Cost & failure handling

**Cost guardrail**
- `lib/cost.ts` mirrors OpenAI's pricing table (kept as a const map keyed by `quality × resolution`).
- Cost preview shown before every Generate click.
- Hard cap: 20 slides per request.
- gpt-image-2 has two independent axes: **quality** (`low` / `medium` / `high`) and **resolution** (`1024` / `2048` / `4096`).
  - For Instagram square posts we fix resolution at `1024×1024` (Instagram's display ceiling for feed is 1080×1350; 1024 is close enough and 4× cheaper than 4K).
  - The UI exposes a single dropdown labelled "Quality": **low / medium / high (recommended) / 4K (one-offs)**. Internally:
    - `low` → quality=low, res=1024
    - `medium` → quality=medium, res=1024
    - `high` → quality=high, res=1024
    - `4K` → quality=high, res=4096 (use when you plan to crop or zoom)
  - Default: `high` (best quality at 1024 — the price difference vs medium is small enough that defaulting up is worth it for Instagram polish).

**Failure modes**
| Failure | Behavior |
|---|---|
| Invalid JSON / Zod error | Show inline error, disable Generate. |
| OpenAI 4xx (bad request) | Surface error message in slide card. No auto-retry. |
| OpenAI 5xx / network | Auto-retry once after 2s. If still failing → red slide card with manual Retry. |
| Per-slide timeout (>90s) | Treated as transient. Auto-retry once. |
| Missing brand kit | Block Generate, show setup prompt. |
| One slide fails mid-batch | Other slides continue; failed slide is replaceable via Retry. |

**Concurrency**: 4 parallel calls max (avoid OpenAI rate limits, smooth out cost spikes).

---

## 10. Testing

- **`lib/prompt.ts`** — snapshot tests, one per layout (`centered_text`, `mascot_hero`, `icon_list`, `mock_ui`, `quote`). Pin the exact prompt string so iterations on wording are visible in diffs.
- **`lib/schema.ts`** — Zod validation tests (good input, missing fields, total mismatch, hard-cap exceeded).
- **`lib/cost.ts`** — cost calc tests against the published pricing table.
- **`lib/zip.ts`** — smoke test bundles 2 fake PNGs and verifies the resulting blob.
- **API route** — integration test with `gpt-image-2` mocked. Verifies validation, concurrency cap, SSE shape, per-slide failure isolation.
- No e2e (Playwright) for v1 — single user, local only, manual smoke test is enough.

---

## 11. Implementation milestones (rough)

These are not the implementation plan — that comes from `writing-plans`. They're a sanity check that the spec is decomposable.

1. Repo init, Next.js scaffold, env wiring, tailwind theme.
2. `lib/prompt.ts` + snapshot tests (build the prompt before any UI).
3. `lib/openai.ts` + `lib/cost.ts` + `lib/schema.ts` + their tests.
4. API routes (`/api/generate` SSE + `/api/generate-single`) + integration test.
5. Brand kit panel + localStorage round-trip.
6. Carousel input editor + live validation + cost preview.
7. Gallery + slide cards + retry/regenerate + ZIP download.
8. README + manual smoke test on a real AI Office carousel.

---

## 12. Open questions

None blocking — to be revisited after first real carousel:

- Is `high @ 1024` sweet-spot enough, or should the default drop to `medium @ 1024` to halve cost? Decide after one real carousel.
- How do the 5 layouts hold up against real copy variety? May need to add or refine after one or two real runs.
- Does sending existing rendered AI Office slides as references give better consistency than just the bare mascot, or do they bias the model into copying old copy? Empirical question.

---

## 13. Future (v2+, explicitly deferred)

- Deploy to EC2 alongside Ozap Office for phone access
- Postgres-backed project history
- LLM-assisted copy generation (paste topic → suggested slide copy)
- Multi-brand support (current design assumes one brand kit at a time; extend `brandKit` to a list keyed by name)
- Direct Instagram publishing via Graph API
