# Sprite Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all procedural Canvas 2D drawing with PNG sprite rendering from pixel-agents (MIT).

**Architecture:** Copy pixel-agents' PNG assets into `public/assets/`. Build a browser-side sprite loader that converts PNGs to `SpriteData` (2D hex string arrays) and caches them as `OffscreenCanvas` at 2x scale. Rewrite the rendering pipeline to blit sprites instead of calling `fillRect`. Keep the 32px grid — render 16px sprites at 2x. Backend and state management untouched.

**Tech Stack:** Next.js 15, React 19, Canvas 2D API, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-15-sprite-visual-overhaul-design.md`

---

## Chunk 1: Foundation — Assets, Sprite Loader, Cache, Colorize, Coordinates

### Task 1: Copy Assets from pixel-agents

**Files:**
- Create: `apps/web/public/assets/characters/char_0.png` through `char_5.png`
- Create: `apps/web/public/assets/floors/floor_0.png` through `floor_8.png`
- Create: `apps/web/public/assets/walls/wall_0.png`
- Create: `apps/web/public/assets/furniture/` (all items with manifests)
- Create: `apps/web/public/assets/bubbles/` (speech bubble JSON definitions)

- [ ] **Step 1: Clone pixel-agents repo to temp directory**

```bash
git clone --depth 1 https://github.com/pablodelucca/pixel-agents.git /tmp/pixel-agents
```

- [ ] **Step 2: Copy character sprite sheets**

```bash
mkdir -p apps/web/public/assets/characters
cp /tmp/pixel-agents/webview-ui/public/assets/characters/char_*.png apps/web/public/assets/characters/
```

Verify: 6 files (`char_0.png` through `char_5.png`), each 112x96px.

- [ ] **Step 3: Copy floor tile patterns**

```bash
mkdir -p apps/web/public/assets/floors
cp /tmp/pixel-agents/webview-ui/public/assets/floors/floor_*.png apps/web/public/assets/floors/
```

Verify: 9 files (`floor_0.png` through `floor_8.png`), each 16x16px.

- [ ] **Step 4: Copy wall tileset**

```bash
mkdir -p apps/web/public/assets/walls
cp /tmp/pixel-agents/webview-ui/public/assets/walls/wall_0.png apps/web/public/assets/walls/
```

Verify: 1 file, 64x128px.

- [ ] **Step 5: Copy furniture assets with manifests**

```bash
mkdir -p apps/web/public/assets/furniture
cp -r /tmp/pixel-agents/webview-ui/public/assets/furniture/* apps/web/public/assets/furniture/
```

Verify: ~25 directories, each with `manifest.json` + PNG files.

- [ ] **Step 6: Create speech bubble JSON definitions**

Create `apps/web/public/assets/bubbles/bubble-working.json`:
```json
{
  "palette": { "_": "", "B": "#555566", "F": "#EEEEFF", "D": "#CCCCDD", "A": "#CCA700" },
  "pixels": [
    ["_","_","_","B","B","B","B","B","B","_","_"],
    ["_","_","B","F","F","F","F","F","F","B","_"],
    ["_","B","F","F","F","F","F","F","F","F","B"],
    ["_","B","F","F","A","F","A","F","A","F","B"],
    ["_","B","F","F","A","F","A","F","A","F","B"],
    ["_","B","F","F","F","F","F","F","F","F","B"],
    ["_","B","F","F","F","F","F","F","F","F","B"],
    ["_","_","B","F","F","F","F","F","F","B","_"],
    ["_","_","_","B","B","B","B","B","B","_","_"],
    ["_","_","_","_","B","F","B","_","_","_","_"],
    ["_","_","_","_","_","B","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_","_","_","_"]
  ]
}
```

Create `apps/web/public/assets/bubbles/bubble-done.json`:
```json
{
  "palette": { "_": "", "B": "#555566", "F": "#EEEEFF", "G": "#44AA44" },
  "pixels": [
    ["_","_","_","B","B","B","B","B","B","_","_"],
    ["_","_","B","F","F","F","F","F","F","B","_"],
    ["_","B","F","F","F","F","F","F","F","F","B"],
    ["_","B","F","F","F","F","F","F","G","F","B"],
    ["_","B","F","F","F","F","F","G","F","F","B"],
    ["_","B","F","G","F","F","G","F","F","F","B"],
    ["_","B","F","F","G","G","F","F","F","F","B"],
    ["_","_","B","F","F","F","F","F","F","B","_"],
    ["_","_","_","B","B","B","B","B","B","_","_"],
    ["_","_","_","_","B","F","B","_","_","_","_"],
    ["_","_","_","_","_","B","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_","_","_","_"]
  ]
}
```

Create `apps/web/public/assets/bubbles/bubble-waiting.json`:
```json
{
  "palette": { "_": "", "B": "#555566", "F": "#EEEEFF", "A": "#CCA700" },
  "pixels": [
    ["_","_","_","B","B","B","B","B","B","_","_"],
    ["_","_","B","F","F","F","F","F","F","B","_"],
    ["_","B","F","F","F","A","A","F","F","F","B"],
    ["_","B","F","F","F","F","A","F","F","F","B"],
    ["_","B","F","F","F","F","A","F","F","F","B"],
    ["_","B","F","F","F","F","F","F","F","F","B"],
    ["_","B","F","F","F","F","A","F","F","F","B"],
    ["_","_","B","F","F","F","F","F","F","B","_"],
    ["_","_","_","B","B","B","B","B","B","_","_"],
    ["_","_","_","_","B","F","B","_","_","_","_"],
    ["_","_","_","_","_","B","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_","_","_","_"]
  ]
}
```

Create `apps/web/public/assets/bubbles/bubble-error.json`:
```json
{
  "palette": { "_": "", "B": "#555566", "F": "#EEEEFF", "R": "#CC4444" },
  "pixels": [
    ["_","_","_","B","B","B","B","B","B","_","_"],
    ["_","_","B","F","F","F","F","F","F","B","_"],
    ["_","B","F","F","R","F","F","F","R","F","B"],
    ["_","B","F","F","F","R","F","R","F","F","B"],
    ["_","B","F","F","F","F","R","F","F","F","B"],
    ["_","B","F","F","F","R","F","R","F","F","B"],
    ["_","B","F","F","R","F","F","F","R","F","B"],
    ["_","_","B","F","F","F","F","F","F","B","_"],
    ["_","_","_","B","B","B","B","B","B","_","_"],
    ["_","_","_","_","B","F","B","_","_","_","_"],
    ["_","_","_","_","_","B","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_","_","_","_"]
  ]
}
```

- [ ] **Step 7: Clean up temp directory**

```bash
rm -rf /tmp/pixel-agents
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/public/assets/
git commit -m "feat: add pixel-agents sprite assets (MIT license)"
```

---

### Task 2: Sprite Loader

**Files:**
- Create: `apps/web/lib/canvas/sprite-loader.ts`

This module loads all PNG assets in the browser and converts them to `SpriteData` format.

- [ ] **Step 1: Define types and constants**

Create `apps/web/lib/canvas/sprite-loader.ts`:

```typescript
type SpriteData = string[][]

type CharacterSprites = {
  walk: Record<Direction, SpriteData[]>
  typing: Record<Direction, SpriteData[]>
  reading: Record<Direction, SpriteData[]>
}

type Direction = "down" | "up" | "right" | "left"

type BubbleType = "working" | "done" | "waiting" | "error"

type FurnitureManifest = {
  id: string
  name: string
  type: "asset" | "group"
  groupType?: "rotation" | "state" | "animation"
  width?: number
  height?: number
  footprintW?: number
  footprintH?: number
  file?: string
  state?: string
  orientation?: string
  members?: FurnitureManifest[]
}

type FurnitureSprites = Record<string, {
  manifest: FurnitureManifest
  sprites: Record<string, SpriteData>
}>

type AssetBundle = {
  characters: (CharacterSprites | undefined)[]
  floors: SpriteData[]
  wallTileset: SpriteData[]
  furniture: FurnitureSprites
  bubbles: Record<BubbleType, SpriteData>
}

const CHAR_FRAME_W = 16
const CHAR_FRAME_H = 32
const CHAR_FRAMES_PER_ROW = 7
const CHAR_PALETTE_COUNT = 6
const FLOOR_COUNT = 9
const WALL_PIECE_W = 16
const WALL_PIECE_H = 32
```

- [ ] **Step 2: Implement PNG-to-SpriteData conversion**

Add to same file:

```typescript
const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load: ${src}`))
    img.src = src
  })

const imageToSpriteData = (img: HTMLImageElement): SpriteData => {
  const canvas = document.createElement("canvas")
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, img.width, img.height)

  const rows: SpriteData = []
  for (let y = 0; y < img.height; y++) {
    const row: string[] = []
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      const a = data[i + 3]
      if (a < 2) {
        row.push("")
      } else {
        const r = data[i].toString(16).padStart(2, "0")
        const g = data[i + 1].toString(16).padStart(2, "0")
        const b = data[i + 2].toString(16).padStart(2, "0")
        row.push(`#${r}${g}${b}`)
      }
    }
    rows.push(row)
  }
  return rows
}

const extractRegion = (
  sprite: SpriteData,
  x: number,
  y: number,
  w: number,
  h: number
): SpriteData =>
  sprite.slice(y, y + h).map((row) => row.slice(x, x + w))

const mirrorHorizontal = (sprite: SpriteData): SpriteData =>
  sprite.map((row) => [...row].reverse())
```

- [ ] **Step 3: Implement character sprite sheet parsing**

```typescript
const parseCharacterSheet = (sheet: SpriteData): CharacterSprites => {
  const directionRows: Direction[] = ["down", "up", "right"]
  const walkIndices = [0, 1, 2]
  const typingIndices = [3, 4]
  const readingIndices = [5, 6]

  const extractFrames = (dir: number, indices: number[]): SpriteData[] =>
    indices.map((i) =>
      extractRegion(sheet, i * CHAR_FRAME_W, dir * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H)
    )

  const walk: Record<Direction, SpriteData[]> = { down: [], up: [], right: [], left: [] }
  const typing: Record<Direction, SpriteData[]> = { down: [], up: [], right: [], left: [] }
  const reading: Record<Direction, SpriteData[]> = { down: [], up: [], right: [], left: [] }

  for (let d = 0; d < 3; d++) {
    const dir = directionRows[d]
    walk[dir] = extractFrames(d, walkIndices)
    typing[dir] = extractFrames(d, typingIndices)
    reading[dir] = extractFrames(d, readingIndices)
  }

  walk.left = walk.right.map(mirrorHorizontal)
  typing.left = typing.right.map(mirrorHorizontal)
  reading.left = reading.right.map(mirrorHorizontal)

  return { walk, typing, reading }
}
```

- [ ] **Step 4: Implement wall tileset parsing**

```typescript
const parseWallTileset = (sheet: SpriteData): SpriteData[] => {
  const pieces: SpriteData[] = []
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      pieces.push(
        extractRegion(sheet, col * WALL_PIECE_W, row * WALL_PIECE_H, WALL_PIECE_W, WALL_PIECE_H)
      )
    }
  }
  return pieces
}
```

- [ ] **Step 5: Implement bubble loader (JSON)**

```typescript
type BubbleJson = {
  palette: Record<string, string>
  pixels: string[][]
}

const loadBubble = async (type: BubbleType): Promise<SpriteData> => {
  const response = await fetch(`/assets/bubbles/bubble-${type}.json`)
  const json: BubbleJson = await response.json()
  return json.pixels.map((row) =>
    row.map((key) => json.palette[key] ?? "")
  )
}
```

- [ ] **Step 6: Implement furniture loader**

```typescript
const loadFurnitureItem = async (name: string): Promise<{ manifest: FurnitureManifest; sprites: Record<string, SpriteData> }> => {
  const basePath = `/assets/furniture/${name}`
  const manifestRes = await fetch(`${basePath}/manifest.json`)
  const manifest: FurnitureManifest = await manifestRes.json()

  const sprites: Record<string, SpriteData> = {}

  const collectAssets = async (node: FurnitureManifest) => {
    if (node.type === "asset" && node.file) {
      try {
        const img = await loadImage(`${basePath}/${node.file}`)
        sprites[node.id] = imageToSpriteData(img)
      } catch {
        console.warn(`Missing furniture sprite: ${basePath}/${node.file}`)
      }
    }
    if (node.members) {
      await Promise.all(node.members.map(collectAssets))
    }
  }

  await collectAssets(manifest)
  return { manifest, sprites }
}
```

- [ ] **Step 7: Implement main loadAllAssets function**

```typescript
const FURNITURE_ITEMS = [
  "BIN", "BOOKSHELF", "CACTUS", "CLOCK", "COFFEE", "COFFEE_TABLE",
  "CUSHIONED_BENCH", "CUSHIONED_CHAIR", "DESK", "DOUBLE_BOOKSHELF",
  "HANGING_PLANT", "LARGE_PAINTING", "LARGE_PLANT", "PC", "PLANT",
  "PLANT_2", "POT", "SMALL_PAINTING", "SMALL_PAINTING_2", "SMALL_TABLE",
  "SOFA", "TABLE_FRONT", "WHITEBOARD", "WOODEN_BENCH", "WOODEN_CHAIR",
]

export const loadAllAssets = async (): Promise<AssetBundle> => {
  const characterPromises = Array.from({ length: CHAR_PALETTE_COUNT }, (_, i) =>
    loadImage(`/assets/characters/char_${i}.png`)
      .then(imageToSpriteData)
      .then(parseCharacterSheet)
      .catch(() => {
        console.warn(`Failed to load char_${i}.png`)
        return null
      })
  )

  const floorPromises = Array.from({ length: FLOOR_COUNT }, (_, i) =>
    loadImage(`/assets/floors/floor_${i}.png`)
      .then(imageToSpriteData)
      .catch(() => {
        console.warn(`Failed to load floor_${i}.png`)
        return null
      })
  )

  const wallPromise = loadImage("/assets/walls/wall_0.png")
    .then(imageToSpriteData)
    .then(parseWallTileset)
    .catch(() => {
      console.warn("Failed to load wall_0.png")
      return [] as SpriteData[]
    })

  const bubbleTypes: BubbleType[] = ["working", "done", "waiting", "error"]
  const bubblePromises = bubbleTypes.map((type) =>
    loadBubble(type).catch(() => {
      console.warn(`Failed to load bubble-${type}.json`)
      return [] as SpriteData
    })
  )

  const furniturePromises = FURNITURE_ITEMS.map((name) =>
    loadFurnitureItem(name).catch(() => {
      console.warn(`Failed to load furniture: ${name}`)
      return null
    })
  )

  const [charResults, floorResults, wallTileset, bubbleResults, furnitureResults] = await Promise.all([
    Promise.all(characterPromises),
    Promise.all(floorPromises),
    wallPromise,
    Promise.all(bubblePromises),
    Promise.all(furniturePromises),
  ])

  // Preserve indices — failed loads stay as undefined so palette assignments stay correct
  const characters = charResults.map((c) => c ?? undefined) as (CharacterSprites | undefined)[]
  const floors = floorResults.filter((f): f is SpriteData => f !== null)

  const bubbles = {} as Record<BubbleType, SpriteData>
  bubbleTypes.forEach((type, i) => {
    bubbles[type] = bubbleResults[i]
  })

  const furniture: FurnitureSprites = {}
  for (const result of furnitureResults) {
    if (result) furniture[result.manifest.id] = result
  }

  return { characters, floors, wallTileset, furniture, bubbles }
}

export type { SpriteData, CharacterSprites, AssetBundle, Direction, BubbleType, FurnitureSprites, FurnitureManifest }
```

- [ ] **Step 8: Verify it compiles**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: No errors related to sprite-loader.ts

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/canvas/sprite-loader.ts
git commit -m "feat: add sprite loader — PNG to SpriteData conversion"
```

---

### Task 3: Sprite Cache

**Files:**
- Create: `apps/web/lib/canvas/sprite-cache.ts`

WeakMap-based cache that renders SpriteData to OffscreenCanvas at a given scale.

- [ ] **Step 1: Implement sprite cache**

Create `apps/web/lib/canvas/sprite-cache.ts`:

```typescript
import type { SpriteData } from "./sprite-loader"

const SCALE = 2
const cacheMap = new WeakMap<SpriteData, OffscreenCanvas>()

export const getCachedSprite = (sprite: SpriteData): OffscreenCanvas => {
  const cached = cacheMap.get(sprite)
  if (cached) return cached

  const rows = sprite.length
  const cols = sprite[0]?.length ?? 0
  const canvas = new OffscreenCanvas(cols * SCALE, rows * SCALE)
  const ctx = canvas.getContext("2d")!

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const color = sprite[y][x]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE)
    }
  }

  cacheMap.set(sprite, canvas)
  return canvas
}

export const SPRITE_SCALE = SCALE

const MAGENTA_PLACEHOLDER: SpriteData = Array.from({ length: 16 }, () =>
  Array.from({ length: 16 }, () => "#ff00ff")
)

export const getPlaceholderSprite = (): OffscreenCanvas =>
  getCachedSprite(MAGENTA_PLACEHOLDER)
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm -F @ozap-office/web typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/canvas/sprite-cache.ts
git commit -m "feat: add WeakMap sprite cache with 2x scaling"
```

---

### Task 4: Colorize Module

**Files:**
- Create: `apps/web/lib/canvas/colorize.ts`

Photoshop-style HSL Colorize for tinting grayscale floor/wall sprites.

- [ ] **Step 1: Implement colorize**

Create `apps/web/lib/canvas/colorize.ts`:

```typescript
import type { SpriteData } from "./sprite-loader"

type ColorConfig = {
  h: number
  s: number
  b: number
  c: number
}

const hexToRgb = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

const hslToHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(Math.max(0, Math.min(255, color * 255)))
      .toString(16)
      .padStart(2, "0")
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const perceivedLuminance = (r: number, g: number, b: number): number =>
  0.299 * r + 0.587 * g + 0.114 * b

export const colorizeSprite = (sprite: SpriteData, config: ColorConfig): SpriteData =>
  sprite.map((row) =>
    row.map((pixel) => {
      if (!pixel) return ""
      const [r, g, b] = hexToRgb(pixel)
      let lum = perceivedLuminance(r, g, b)

      if (config.c !== 0) {
        lum = (lum - 0.5) * (1 + config.c) + 0.5
      }
      lum = Math.max(0, Math.min(1, lum + config.b))

      return hslToHex(config.h, config.s, lum)
    })
  )

export const ROOM_FLOOR_COLORS: Record<string, { floorIndex: number; color: ColorConfig }> = {
  boss_office: { floorIndex: 0, color: { h: 30, s: 0.4, b: 0.1, c: 0.2 } },
  open_office: { floorIndex: 2, color: { h: 200, s: 0.1, b: 0.0, c: 0.0 } },
  meeting_room: { floorIndex: 4, color: { h: 220, s: 0.3, b: -0.1, c: 0.1 } },
  hallway: { floorIndex: 1, color: { h: 40, s: 0.15, b: 0.1, c: 0.0 } },
  outdoor: { floorIndex: 5, color: { h: 120, s: 0.3, b: -0.1, c: 0.1 } },
}

export const WALL_COLOR: ColorConfig = { h: 30, s: 0.25, b: 0.0, c: 0.1 }

export type { ColorConfig }
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm -F @ozap-office/web typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/canvas/colorize.ts
git commit -m "feat: add HSL colorize module for floor/wall tinting"
```

---

### Task 5: Rename isometric.ts to coordinates.ts

**Files:**
- Rename: `apps/web/lib/canvas/isometric.ts` → `apps/web/lib/canvas/coordinates.ts`
- Modify: `apps/web/lib/components/office-canvas.tsx` (update import)

NOTE: Do NOT update imports in sprite-manager.ts or office-renderer.ts — those files are fully rewritten in Tasks 7 and 9. Only update office-canvas.tsx which is modified (not rewritten).

- [ ] **Step 1: Rename the file**

```bash
git mv apps/web/lib/canvas/isometric.ts apps/web/lib/canvas/coordinates.ts
```

- [ ] **Step 2: Update import in office-canvas.tsx**

Change `import { CANVAS_CONFIG } from "@/lib/canvas/isometric"` to `import { CANVAS_CONFIG } from "@/lib/canvas/coordinates"`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: rename isometric.ts to coordinates.ts"
```

NOTE: This will temporarily break compilation because sprite-manager.ts and office-renderer.ts still import from `./isometric`. That's expected — they are fully rewritten in Tasks 7 and 9 which happen in the same work session.

---

## Chunk 2: Data Layer — Tile Map Rewrite

### Task 6: Rewrite tile-map.ts

**Files:**
- Rewrite: `apps/web/lib/canvas/tile-map.ts`

Simplify tile types: collapse 11 wall variants into single `wall` type. Keep floor variants, replace furniture tile types with `floor` + separate furniture placement data. Keep room structure, desk positions, meeting routes.

- [ ] **Step 1: Define new tile types and furniture placement**

Rewrite `apps/web/lib/canvas/tile-map.ts` with:

```typescript
export type TileType =
  | "floor"
  | "wall"
  | "grass"
  | "path"
  | "empty"

export type RoomType = "boss_office" | "meeting_room" | "open_office" | "hallway" | "outdoor"

export type Tile = {
  type: TileType
  room: RoomType | null
  variant?: number
}

export type FurniturePlacement = {
  id: string
  gridX: number
  gridY: number
  orientation?: "front" | "back" | "side"
  state?: "on" | "off"
}

const GRID_WIDTH = 30
const GRID_HEIGHT = 20
```

- [ ] **Step 2: Rebuild grid with simplified types**

Replace the grid builder shortcuts and the grid itself. Conversion rules:
- `wall_top`, `wall_left`, `wall_right`, `wall_bottom`, `wall_corner_*` → `W(room)`
- `desk`, `chair`, `monitor`, `plant`, `bookshelf`, `whiteboard`, `rug`, `table`, `coffee_machine` → `F(room)`
- `floor_wood`, `floor_tile`, `floor_carpet` → `F(room)` (room determines visual via colorize)
- `grass`, `path` → unchanged

```typescript
const t = (type: TileType, room: RoomType | null = null, variant?: number): Tile => ({
  type,
  room,
  ...(variant !== undefined ? { variant } : {}),
})

const G = (v?: number) => t("grass", "outdoor", v)
const P = () => t("path", "outdoor")
const F = (room: RoomType) => t("floor", room)
const W = (room: RoomType) => t("wall", room)
const HW = () => F("hallway")

const b = "boss_office" as const
const m = "meeting_room" as const
const o = "open_office" as const

export const createOfficeMap = (): Tile[][] => [
  //  0        1        2        3        4        5        6        7        8        9        10       11       12       13       14       15       16       17       18       19       20       21       22       23       24       25       26       27       28       29
  [G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G()    ], // row 0
  [G(),     W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    G(1),    P(),     G(),     W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    G()    ], // row 1
  [G(2),    W(b),    F(b),    F(b),    F(b),    F(b),    F(b),    F(b),    W(b),    G(),     P(),     G(2),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G(1)   ], // row 2
  [G(),     W(b),    F(b),    F(b),    F(b),    F(b),    F(b),    F(b),    W(b),    G(),     P(),     G(),     W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G()    ], // row 3
  [G(1),    W(b),    F(b),    F(b),    F(b),    F(b),    F(b),    F(b),    W(b),    G(2),    P(),     G(1),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G()    ], // row 4
  [G(),     W(b),    F(b),    F(b),    F(b),    F(b),    F(b),    F(b),    F(b),    HW(),    HW(),    HW(),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G(2)   ], // row 5
  [G(),     W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    HW(),    HW(),    HW(),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G()    ], // row 6
  [G(1),    G(),     G(),     G(),     G(),     G(),     G(1),    F("hallway"),HW(),HW(),   HW(),    HW(),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G(1)   ], // row 7
  [G(),     G(2),    G(),     G(),     G(),     G(),     G(),     G(),     HW(),    HW(),    HW(),    HW(),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G()    ], // row 8
  [G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     HW(),    HW(),    HW(),    HW(),    W(o),    F(o),    F(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    G()    ], // row 9
  [G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     P(),     P(),     HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(2)   ], // row 10
  [G(),     G(1),    G(),     G(2),    G(),     G(),     G(1),    G(),     P(),     P(),     W(m),    W(m),    W(m),    F(m),    F(m),    W(m),    W(m),    W(m),    G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G()    ], // row 11
  [G(),     G(),     G(2),    G(),     G(),     G(),     G(),     G(),     P(),     P(),     W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(),     G(),     G(2),    G()    ], // row 12
  [G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     P(),     W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(),     G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     G(),     G(1)   ], // row 13
  [G(),     G(),     G(1),    G(),     G(),     G(1),    G(),     G(),     G(2),    P(),     W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(1),    G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(1),    G()    ], // row 14
  [G(2),    G(),     G(),     G(),     G(),     G(),     G(2),    G(),     G(),     P(),     W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G()    ], // row 15
  [G(),     G(1),    G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     P(),     W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(),     G(),     G(1),    G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(2)   ], // row 16
  [G(),     G(),     G(),     G(),     G(1),    G(),     G(2),    G(),     G(),     P(),     W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    G(1),    G(),     G(),     G(),     G(),     G(2),    G(),     G(),     G(),     G(),     G(1),    G()    ], // row 17
  [G(1),    G(),     G(2),    G(),     G(),     G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     G(),     G(1),    G(2),    G(),     G(),     G(),     G(1),    G(),     G(2),    G(),     G(),     G()    ], // row 18
  [G(),     G(),     G(),     G(1),    G(),     G(2),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G(1),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(),     G(1)   ], // row 19
]
```

The room assignments are identical to the original grid. All furniture cells (desk, chair, monitor, plant, bookshelf, whiteboard, rug, table, coffee_machine) are now `F(room)`. All wall variants are now `W(room)`. All floor variants are now `F(room)`. Outdoor plants move to `FURNITURE_PLACEMENTS`.

- [ ] **Step 3: Add wall auto-tiling bitmask computation**

```typescript
export const computeWallBitmasks = (grid: Tile[][]): number[][] => {
  const bitmasks: number[][] = Array.from({ length: GRID_HEIGHT }, () =>
    Array(GRID_WIDTH).fill(0)
  )

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (grid[y][x].type !== "wall") continue
      let mask = 0
      if (y > 0 && grid[y - 1][x].type === "wall") mask |= 1               // N
      if (x < GRID_WIDTH - 1 && grid[y][x + 1].type === "wall") mask |= 2   // E
      if (y < GRID_HEIGHT - 1 && grid[y + 1][x].type === "wall") mask |= 4  // S
      if (x > 0 && grid[y][x - 1].type === "wall") mask |= 8               // W
      bitmasks[y][x] = mask
    }
  }

  return bitmasks
}
```

- [ ] **Step 4: Add furniture placements array**

Extract all furniture positions from the original grid. Map current procedural items to pixel-agents furniture IDs:

```typescript
const b = "boss_office" as const
const m = "meeting_room" as const
const o = "open_office" as const

export const FURNITURE_PLACEMENTS: FurniturePlacement[] = [
  // Boss office
  { id: "DESK", gridX: 3, gridY: 3, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 3, gridY: 4, orientation: "front" },
  { id: "BOOKSHELF", gridX: 6, gridY: 3, orientation: "front" },
  { id: "LARGE_PLANT", gridX: 7, gridY: 4, orientation: "front" },
  { id: "SOFA", gridX: 2, gridY: 5, orientation: "front" },
  { id: "LARGE_PAINTING", gridX: 4, gridY: 1, orientation: "front" },

  // Open office desks (5 stations)
  { id: "PC", gridX: 14, gridY: 3, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 14, gridY: 4, orientation: "front" },
  { id: "PC", gridX: 17, gridY: 3, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 17, gridY: 4, orientation: "front" },
  { id: "PC", gridX: 20, gridY: 3, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 20, gridY: 4, orientation: "front" },
  { id: "PC", gridX: 23, gridY: 3, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 23, gridY: 4, orientation: "front" },
  { id: "PC", gridX: 26, gridY: 3, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 26, gridY: 4, orientation: "front" },

  // Open office decoration
  { id: "COFFEE", gridX: 25, gridY: 8, orientation: "front" },
  { id: "HANGING_PLANT", gridX: 18, gridY: 1, orientation: "front" },

  // Meeting room
  { id: "WHITEBOARD", gridX: 11, gridY: 12, orientation: "front" },
  { id: "TABLE_FRONT", gridX: 13, gridY: 13, orientation: "front" },
  { id: "TABLE_FRONT", gridX: 14, gridY: 13, orientation: "front" },
  { id: "TABLE_FRONT", gridX: 15, gridY: 13, orientation: "front" },
  { id: "TABLE_FRONT", gridX: 13, gridY: 14, orientation: "front" },
  { id: "TABLE_FRONT", gridX: 14, gridY: 14, orientation: "front" },
  { id: "TABLE_FRONT", gridX: 15, gridY: 14, orientation: "front" },
  { id: "TABLE_FRONT", gridX: 13, gridY: 15, orientation: "front" },
  { id: "TABLE_FRONT", gridX: 14, gridY: 15, orientation: "front" },
  { id: "TABLE_FRONT", gridX: 15, gridY: 15, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 13, gridY: 12, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 14, gridY: 12, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 15, gridY: 12, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 12, gridY: 13, orientation: "side" },
  { id: "CUSHIONED_CHAIR", gridX: 16, gridY: 13, orientation: "side" },
  { id: "CUSHIONED_CHAIR", gridX: 12, gridY: 15, orientation: "side" },
  { id: "CUSHIONED_CHAIR", gridX: 16, gridY: 15, orientation: "side" },
  { id: "CUSHIONED_CHAIR", gridX: 13, gridY: 16, orientation: "back" },
  { id: "CUSHIONED_CHAIR", gridX: 14, gridY: 16, orientation: "back" },
  { id: "CUSHIONED_CHAIR", gridX: 15, gridY: 16, orientation: "back" },
  { id: "SMALL_PAINTING", gridX: 13, gridY: 11, orientation: "front" },

  // Hallway
  { id: "COFFEE", gridX: 7, gridY: 7, orientation: "front" },

  // Outdoor
  { id: "PLANT", gridX: 3, gridY: 7, orientation: "front" },
  { id: "PLANT_2", gridX: 12, gridY: 18, orientation: "front" },
  { id: "CLOCK", gridX: 22, gridY: 1, orientation: "front" },
]
```

- [ ] **Step 5: Keep existing exports intact**

The following exports MUST remain with the same shape (they're consumed by `use-agents.ts` and `office-renderer.ts`):

```typescript
export const OFFICE_MAP = createOfficeMap()
export const GRID = { width: GRID_WIDTH, height: GRID_HEIGHT }

export const ROOM_LABELS: Array<{ text: string; gridX: number; gridY: number }> = [
  { text: "BOSS OFFICE", gridX: 4, gridY: 1 },
  { text: "OPEN OFFICE", gridX: 20, gridY: 1 },
  { text: "MEETING ROOM", gridX: 13, gridY: 11 },
]

export const OPEN_OFFICE_DESK_POSITIONS: Array<{ gridX: number; gridY: number }> = [
  { gridX: 14, gridY: 4 },
  { gridX: 17, gridY: 4 },
  { gridX: 20, gridY: 4 },
  { gridX: 23, gridY: 4 },
  { gridX: 26, gridY: 4 },
]

export const WALL_BITMASKS = computeWallBitmasks(OFFICE_MAP)
```

Keep `MEETING_ROUTES` exactly as they are — no changes.

- [ ] **Step 6: Do NOT commit yet**

This breaks compilation because sprite-manager.ts and office-renderer.ts reference old tile types. Do NOT commit Task 6 alone. Continue directly to Tasks 7, 8, and 9. All rendering files (tile-map.ts, sprite-manager.ts, effects.ts, office-renderer.ts) are committed together after Task 9.

---

## Chunk 3: Rendering — Sprite Manager, Effects, Office Renderer

### Task 7: Rewrite sprite-manager.ts

**Files:**
- Rewrite: `apps/web/lib/canvas/sprite-manager.ts`

Replace all procedural `draw*()` functions with sprite blitting.

- [ ] **Step 1: Rewrite sprite-manager.ts**

Full rewrite. Key design:
- Colorized sprites cached in a module-level `Map<string, SpriteData>` keyed by `"floor:roomType"` or `"wall"`.
- Character sprites indexed by palette → direction → animation → frame using the `AssetBundle`.
- Grass/path rendered as colorized floor variants (grass = floor with green tint, path = floor with beige tint).

```typescript
import type { AgentStatus } from "@ozap-office/shared"
import type { AssetBundle, SpriteData, BubbleType, Direction } from "./sprite-loader"
import { getCachedSprite, getPlaceholderSprite, SPRITE_SCALE } from "./sprite-cache"
import { colorizeSprite, ROOM_FLOOR_COLORS, WALL_COLOR, type ColorConfig } from "./colorize"
import { CANVAS_CONFIG } from "./coordinates"

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#888888",
  working: "#50fa7b",
  thinking: "#f1fa8c",
  waiting: "#ffb86c",
  meeting: "#bd93f9",
  error: "#ff5555",
  has_report: "#ffb86c",
}

type AnimationType = "idle" | "walk" | "typing" | "reading"

const WALK_CYCLE = [0, 1, 2, 1]

const colorizedCache = new Map<string, SpriteData>()

const getColorizedFloor = (assets: AssetBundle, room: string): OffscreenCanvas => {
  const key = `floor:${room}`
  let sprite = colorizedCache.get(key)
  if (!sprite) {
    const config = ROOM_FLOOR_COLORS[room]
    if (!config || !assets.floors[config.floorIndex]) return getPlaceholderSprite()
    sprite = colorizeSprite(assets.floors[config.floorIndex], config.color)
    colorizedCache.set(key, sprite)
  }
  return getCachedSprite(sprite)
}

const GRASS_COLOR: ColorConfig = { h: 120, s: 0.3, b: -0.1, c: 0.1 }
const PATH_COLOR: ColorConfig = { h: 40, s: 0.2, b: 0.15, c: 0.0 }

const getColorizedGrass = (assets: AssetBundle, variant: number): OffscreenCanvas => {
  const key = `grass:${variant}`
  let sprite = colorizedCache.get(key)
  if (!sprite) {
    const floorIdx = Math.min(variant, assets.floors.length - 1)
    sprite = colorizeSprite(assets.floors[floorIdx] ?? assets.floors[0], GRASS_COLOR)
    colorizedCache.set(key, sprite)
  }
  return getCachedSprite(sprite)
}

const getColorizedPath = (assets: AssetBundle): OffscreenCanvas => {
  const key = "path"
  let sprite = colorizedCache.get(key)
  if (!sprite) {
    sprite = colorizeSprite(assets.floors[1] ?? assets.floors[0], PATH_COLOR)
    colorizedCache.set(key, sprite)
  }
  return getCachedSprite(sprite)
}

const colorizedWalls: SpriteData[] = []
const getColorizedWall = (assets: AssetBundle, bitmask: number): OffscreenCanvas => {
  if (colorizedWalls.length === 0 && assets.wallTileset.length > 0) {
    for (const piece of assets.wallTileset) {
      colorizedWalls.push(colorizeSprite(piece, WALL_COLOR))
    }
  }
  const sprite = colorizedWalls[bitmask]
  return sprite ? getCachedSprite(sprite) : getPlaceholderSprite()
}

export const drawFloorTile = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  assets: AssetBundle, room: string
) => {
  ctx.drawImage(getColorizedFloor(assets, room), x, y)
}

export const drawGrassTile = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  assets: AssetBundle, variant: number
) => {
  ctx.drawImage(getColorizedGrass(assets, variant), x, y)
}

export const drawPathTile = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  assets: AssetBundle
) => {
  ctx.drawImage(getColorizedPath(assets), x, y)
}

export const drawWallTile = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  assets: AssetBundle, bitmask: number
) => {
  const cached = getColorizedWall(assets, bitmask)
  // Walls are 16x32 (32x64 at 2x), anchored at tile bottom
  const offsetY = CANVAS_CONFIG.tileSize - cached.height
  ctx.drawImage(cached, x, y + offsetY)
}

export const drawCharacter = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  assets: AssetBundle, paletteIndex: number,
  animation: AnimationType, direction: Direction, frame: number,
  seated: boolean
) => {
  const charSprites = assets.characters[paletteIndex]
  if (!charSprites) { ctx.drawImage(getPlaceholderSprite(), x, y); return }

  let sprite: SpriteData | undefined
  if (animation === "walk" || animation === "idle") {
    const frameIdx = animation === "idle" ? 1 : WALK_CYCLE[frame % WALK_CYCLE.length]
    sprite = charSprites.walk[direction]?.[frameIdx]
  } else if (animation === "typing") {
    sprite = charSprites.typing[direction]?.[frame % 2]
  } else if (animation === "reading") {
    sprite = charSprites.reading[direction]?.[frame % 2]
  }

  if (!sprite) { ctx.drawImage(getPlaceholderSprite(), x, y); return }

  const cached = getCachedSprite(sprite)
  const sittingOffset = seated ? 12 : 0
  // Center character horizontally in tile, anchor at bottom
  const drawX = x + (CANVAS_CONFIG.tileSize - cached.width) / 2
  const drawY = y + CANVAS_CONFIG.tileSize - cached.height + sittingOffset
  ctx.drawImage(cached, Math.round(drawX), Math.round(drawY))
}

export const drawFurniture = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  assets: AssetBundle, furnitureId: string,
  orientation: string, state: string, animFrame: number
) => {
  const item = assets.furniture[furnitureId]
  if (!item) { ctx.drawImage(getPlaceholderSprite(), x, y); return }

  // Resolve sprite from manifest tree
  const spriteId = resolveFurnitureSprite(item.manifest, orientation, state, animFrame)
  const sprite = spriteId ? item.sprites[spriteId] : undefined

  if (!sprite) { ctx.drawImage(getPlaceholderSprite(), x, y); return }

  const cached = getCachedSprite(sprite)
  const offsetY = CANVAS_CONFIG.tileSize - cached.height
  ctx.drawImage(cached, x, Math.round(y + offsetY))
}

const resolveFurnitureSprite = (
  node: { type: string; groupType?: string; id?: string; orientation?: string; state?: string; members?: any[] },
  targetOrientation: string, targetState: string, animFrame: number
): string | undefined => {
  if (node.type === "asset") return node.id

  if (node.type === "group" && node.members) {
    if (node.groupType === "rotation") {
      const match = node.members.find((m: any) => m.orientation === targetOrientation)
        ?? node.members.find((m: any) => m.orientation === "front")
        ?? node.members[0]
      return match ? resolveFurnitureSprite(match, targetOrientation, targetState, animFrame) : undefined
    }
    if (node.groupType === "state") {
      const match = node.members.find((m: any) => m.state === targetState)
        ?? node.members.find((m: any) => m.state === "off")
        ?? node.members[0]
      return match ? resolveFurnitureSprite(match, targetOrientation, targetState, animFrame) : undefined
    }
    if (node.groupType === "animation") {
      const idx = animFrame % node.members.length
      return resolveFurnitureSprite(node.members[idx], targetOrientation, targetState, animFrame)
    }
  }
  return undefined
}

export const drawBubble = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  assets: AssetBundle, bubbleType: BubbleType,
  seated: boolean, alpha: number = 1
) => {
  const sprite = assets.bubbles[bubbleType]
  if (!sprite || sprite.length === 0) return

  const cached = getCachedSprite(sprite)
  const bubbleX = x + (CANVAS_CONFIG.tileSize - cached.width) / 2
  const bubbleY = y - 48 - (seated ? 12 : 0)

  if (alpha < 1) ctx.globalAlpha = alpha
  ctx.drawImage(cached, Math.round(bubbleX), Math.round(bubbleY))
  if (alpha < 1) ctx.globalAlpha = 1
}

export const drawNameLabel = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  name: string, status: AgentStatus
) => {
  const textWidth = name.length * 6 + 16
  const labelX = x + CANVAS_CONFIG.tileSize / 2 - textWidth / 2
  const labelY = y + CANVAS_CONFIG.tileSize + 4

  ctx.fillStyle = "#00000055"
  ctx.fillRect(Math.round(labelX - 1), Math.round(labelY - 1), textWidth + 2, 13)
  ctx.fillStyle = "#ffffffee"
  ctx.fillRect(Math.round(labelX), Math.round(labelY), textWidth, 11)

  const dotColor = STATUS_COLORS[status]
  ctx.fillStyle = dotColor
  ctx.fillRect(Math.round(labelX + 3), Math.round(labelY + 3), 5, 5)

  ctx.fillStyle = "#111111"
  ctx.font = "bold 8px monospace"
  ctx.textAlign = "left"
  ctx.fillText(name, labelX + 11, labelY + 9)
}

export const drawRoomLabel = (
  ctx: CanvasRenderingContext2D, x: number, y: number, text: string
) => {
  const textWidth = text.length * 6 + 8
  const labelX = x - textWidth / 2 + 16
  const labelY = y + 6

  ctx.fillStyle = "#5a4a3a"
  ctx.fillRect(Math.round(labelX - 1), Math.round(labelY - 1), textWidth + 2, 14)
  ctx.fillStyle = "#f0e8d8"
  ctx.fillRect(Math.round(labelX), Math.round(labelY), textWidth, 12)

  ctx.fillStyle = "#5a4a3a"
  ctx.font = "bold 8px monospace"
  ctx.textAlign = "center"
  ctx.fillText(text, labelX + textWidth / 2, labelY + 9)
}

export type { AnimationType }
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm -F @ozap-office/web typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/canvas/sprite-manager.ts
git commit -m "feat: rewrite sprite-manager with sprite blitting"
```

---

### Task 8: Effects Module

**Files:**
- Create: `apps/web/lib/canvas/effects.ts`

- [ ] **Step 1: Implement Matrix spawn/despawn effect**

Create `apps/web/lib/canvas/effects.ts`:

```typescript
import type { SpriteData } from "./sprite-loader"
import { SPRITE_SCALE } from "./sprite-cache"

const MATRIX_DURATION_SEC = 0.3
const MATRIX_TRAIL_LENGTH = 6
const MATRIX_SPRITE_ROWS = 32

type MatrixMode = "spawn" | "despawn"

export type MatrixEffectState = {
  mode: MatrixMode
  startTime: number
  columnSeeds: number[]
}

export const createMatrixEffect = (mode: MatrixMode, columns: number): MatrixEffectState => ({
  mode,
  startTime: performance.now() / 1000,
  columnSeeds: Array.from({ length: columns }, () => Math.random()),
})

export const isMatrixEffectActive = (effect: MatrixEffectState, now: number): boolean =>
  (now - effect.startTime) < MATRIX_DURATION_SEC

export const renderMatrixEffect = (
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  effect: MatrixEffectState,
  screenX: number,
  screenY: number,
  now: number
): void => {
  const elapsed = now - effect.startTime
  const progress = Math.min(elapsed / MATRIX_DURATION_SEC, 1)
  const cols = sprite[0]?.length ?? 0
  const rows = Math.min(sprite.length, MATRIX_SPRITE_ROWS)

  for (let col = 0; col < cols; col++) {
    const stagger = effect.columnSeeds[col] ?? 0
    const headY = (progress * (1 + stagger * 0.3)) * rows

    for (let row = 0; row < rows; row++) {
      const pixel = sprite[row]?.[col]
      if (!pixel) continue

      const distFromHead = headY - row
      const flicker = ((col * 7 + row * 13 + Math.floor(now * 30) * 31) & 0xff) < 180

      if (effect.mode === "spawn") {
        if (distFromHead < 0) continue
        if (distFromHead < 1 && flicker) {
          ctx.fillStyle = "#ccffcc"
        } else if (distFromHead < MATRIX_TRAIL_LENGTH) {
          const alpha = 1 - distFromHead / MATRIX_TRAIL_LENGTH
          ctx.fillStyle = pixel
          ctx.fillRect(screenX + col * SPRITE_SCALE, screenY + row * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE)
          ctx.fillStyle = `rgba(0, 255, 65, ${alpha * 0.5})`
        } else {
          ctx.fillStyle = pixel
        }
      } else {
        if (distFromHead < 0) {
          ctx.fillStyle = pixel
        } else if (distFromHead < 1 && flicker) {
          ctx.fillStyle = "#ccffcc"
        } else if (distFromHead < MATRIX_TRAIL_LENGTH) {
          const alpha = 1 - distFromHead / MATRIX_TRAIL_LENGTH
          ctx.fillStyle = `rgba(0, 255, 65, ${alpha * 0.5})`
        } else {
          continue
        }
      }

      ctx.fillRect(screenX + col * SPRITE_SCALE, screenY + row * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE)
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm -F @ozap-office/web typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/canvas/effects.ts
git commit -m "feat: add Matrix spawn/despawn effect"
```

---

### Task 9: Rewrite office-renderer.ts

**Files:**
- Rewrite: `apps/web/lib/canvas/office-renderer.ts`

New Z-sorted rendering pipeline with sprite blitting.

- [ ] **Step 1: Rewrite office-renderer.ts**

The new renderer:
1. Clears canvas
2. Draws floor tiles (iterate grid, skip walls/empty, draw colorized floor sprites)
3. Collects all Z-drawable items (walls, furniture, characters) into a flat array
4. Sorts by `zY` ascending
5. Draws items in order
6. Draws speech bubbles on top
7. Draws room labels on top
8. Draws name labels on top

Key changes from current:
- Receives `AssetBundle` as parameter
- Agents now carry animation state (direction, animationType, frame)
- Furniture comes from `FURNITURE_PLACEMENTS` array
- Walls use bitmask lookup into `WALL_BITMASKS`
- Characters with active MatrixEffect render via `renderMatrixEffect` instead of cached sprite

```typescript
import { gridToScreen, CANVAS_CONFIG } from "./coordinates"
import { OFFICE_MAP, GRID, ROOM_LABELS, WALL_BITMASKS, FURNITURE_PLACEMENTS, OPEN_OFFICE_DESK_POSITIONS } from "./tile-map"
import {
  drawFloorTile, drawGrassTile, drawPathTile, drawWallTile,
  drawCharacter, drawFurniture, drawBubble, drawNameLabel, drawRoomLabel,
  type AnimationType
} from "./sprite-manager"
import type { AssetBundle, BubbleType, Direction } from "./sprite-loader"
import type { AgentStatus } from "@ozap-office/shared"

type AgentRenderData = {
  id: string
  name: string
  color: string
  positionX: number
  positionY: number
  status: AgentStatus
  paletteIndex: number
  animation: AnimationType
  direction: Direction
  frame: number
}

type ZDrawable = {
  zY: number
  draw: (ctx: CanvasRenderingContext2D) => void
}

const STATUS_TO_BUBBLE: Partial<Record<AgentStatus, BubbleType>> = {
  working: "working",
  thinking: "working",
  has_report: "done",
  waiting: "waiting",
  error: "error",
}

const getAgentAtDesk = (
  deskGridX: number, deskGridY: number,
  agents: AgentRenderData[]
): AgentRenderData | undefined => {
  // Chair is one row below desk (gridY + 1)
  const chairY = deskGridY + 1
  return agents.find((a) => {
    const gx = Math.round(a.positionX)
    const gy = Math.round(a.positionY)
    return gx === deskGridX && gy === chairY
  })
}

export const renderOffice = (
  ctx: CanvasRenderingContext2D,
  agents: AgentRenderData[],
  assets: AssetBundle,
  canvasWidth: number,
  canvasHeight: number
) => {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // 1. Draw floor tiles (bottom layer)
  for (let y = 0; y < GRID.height; y++) {
    for (let x = 0; x < GRID.width; x++) {
      const tile = OFFICE_MAP[y][x]
      const { x: sx, y: sy } = gridToScreen(x, y)

      if (tile.type === "floor" && tile.room) {
        drawFloorTile(ctx, sx, sy, assets, tile.room)
      } else if (tile.type === "grass") {
        drawGrassTile(ctx, sx, sy, assets, tile.variant ?? 0)
      } else if (tile.type === "path") {
        drawPathTile(ctx, sx, sy, assets)
      }
      // walls and empty handled in Z-sorted pass
    }
  }

  // 2. Collect Z-drawables (walls, furniture, characters)
  const drawables: ZDrawable[] = []

  // Walls
  for (let y = 0; y < GRID.height; y++) {
    for (let x = 0; x < GRID.width; x++) {
      if (OFFICE_MAP[y][x].type !== "wall") continue
      const bitmask = WALL_BITMASKS[y][x]
      const { x: sx, y: sy } = gridToScreen(x, y)
      drawables.push({
        zY: (y + 1) * CANVAS_CONFIG.tileSize,
        draw: (c) => drawWallTile(c, sx, sy, assets, bitmask),
      })
    }
  }

  // Furniture
  const animFrame = Math.floor(performance.now() / 200) % 3
  for (const fp of FURNITURE_PLACEMENTS) {
    const { x: sx, y: sy } = gridToScreen(fp.gridX, fp.gridY)
    // PC on/off: check if agent at this desk is working/thinking
    let state = fp.state ?? "off"
    if (fp.id === "PC") {
      const agent = getAgentAtDesk(fp.gridX, fp.gridY, agents)
      if (agent && (agent.status === "working" || agent.status === "thinking")) {
        state = "on"
      }
    }
    drawables.push({
      zY: (fp.gridY + 1) * CANVAS_CONFIG.tileSize,
      draw: (c) => drawFurniture(c, sx, sy, assets, fp.id, fp.orientation ?? "front", state, animFrame),
    })
  }

  // Characters
  for (const agent of agents) {
    const sx = agent.positionX * CANVAS_CONFIG.tileSize
    const sy = agent.positionY * CANVAS_CONFIG.tileSize
    const seated = agent.animation === "typing" || agent.animation === "reading"
    drawables.push({
      zY: agent.positionY * CANVAS_CONFIG.tileSize + CANVAS_CONFIG.tileSize / 2 + 0.5,
      draw: (c) => {
        drawCharacter(c, sx, sy, assets, agent.paletteIndex, agent.animation, agent.direction, agent.frame, seated)
      },
    })
  }

  // 3. Sort and draw
  drawables.sort((a, b) => a.zY - b.zY)
  for (const d of drawables) d.draw(ctx)

  // 4. Overlays (on top of everything)
  // Speech bubbles
  for (const agent of agents) {
    const bubbleType = STATUS_TO_BUBBLE[agent.status]
    if (!bubbleType) continue
    const sx = agent.positionX * CANVAS_CONFIG.tileSize
    const sy = agent.positionY * CANVAS_CONFIG.tileSize
    const seated = agent.animation === "typing" || agent.animation === "reading"
    const alpha = bubbleType === "waiting" ? 1 : 1 // waiting fade handled in use-agents via timer
    drawBubble(ctx, sx, sy, assets, bubbleType, seated, alpha)
  }

  // Name labels
  for (const agent of agents) {
    const sx = agent.positionX * CANVAS_CONFIG.tileSize
    const sy = agent.positionY * CANVAS_CONFIG.tileSize
    drawNameLabel(ctx, sx, sy, agent.name, agent.status)
  }

  // Room labels
  for (const label of ROOM_LABELS) {
    const { x: sx, y: sy } = gridToScreen(label.gridX, label.gridY)
    drawRoomLabel(ctx, sx, sy, label.text)
  }
}

type ClickResult =
  | { type: "agent"; agentId: string }
  | { type: "meeting_room" }
  | { type: "none" }

export const hitTest = (
  clickX: number,
  clickY: number,
  agents: AgentRenderData[]
): ClickResult => {
  const { tileSize } = CANVAS_CONFIG

  for (const agent of agents) {
    const ax = agent.positionX * tileSize + tileSize / 2
    const ay = agent.positionY * tileSize + tileSize / 2
    const dx = clickX - ax
    const dy = clickY - ay
    if (dx * dx + dy * dy < tileSize * tileSize) {
      return { type: "agent", agentId: agent.id }
    }
  }

  const gridX = Math.floor(clickX / tileSize)
  const gridY = Math.floor(clickY / tileSize)

  if (gridX >= 0 && gridX < GRID.width && gridY >= 0 && gridY < GRID.height) {
    const tile = OFFICE_MAP[gridY][gridX]
    if (tile.room === "meeting_room") {
      return { type: "meeting_room" }
    }
  }

  return { type: "none" }
}

export type { AgentRenderData, ClickResult }
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm -F @ozap-office/web typecheck`

- [ ] **Step 3: Commit all rendering files together** (includes Task 6 tile-map changes)

```bash
git add apps/web/lib/canvas/tile-map.ts apps/web/lib/canvas/sprite-manager.ts apps/web/lib/canvas/effects.ts apps/web/lib/canvas/office-renderer.ts
git commit -m "feat: rewrite rendering pipeline — sprite-based tiles, characters, furniture, effects"
```

---

## Chunk 4: Integration — Animation State, Canvas Component, Wiring

### Task 10: Add Animation State to use-agents.ts

**Files:**
- Modify: `apps/web/lib/use-agents.ts`

Add per-agent animation state tracking: frame index, frame timer, animation type, direction.

- [ ] **Step 1: Add animation types and state**

Add to `use-agents.ts`:

```typescript
type AnimationType = "idle" | "walk" | "typing" | "reading"

type AnimationState = {
  type: AnimationType
  direction: "down" | "up" | "right" | "left"
  frame: number
  timer: number
}
```

Add a `animationStatesRef = useRef<Record<string, AnimationState>>({})` alongside the existing refs.

- [ ] **Step 2: Derive animation type from agent status**

```typescript
const statusToAnimation = (status: AgentStatus, isMoving: boolean): AnimationType => {
  if (isMoving) return "walk"
  if (status === "working") return "typing"
  if (status === "thinking") return "reading"
  return "idle"
}
```

Note: `meeting` status falls through to `"idle"` for stationary agents (at meeting seat). Moving meeting agents get `"walk"` via the `isMoving` check. This matches the spec.

- [ ] **Step 3: Update frame cycling in animation loop**

In the existing `requestAnimationFrame` loop, after position updates, add frame cycling:

- For each agent, check if they're moving (position changed) → `walk` animation
- If not moving, use `statusToAnimation(agent.status)`
- Advance frame timer based on delta time
- Walk: advance every 0.15s, cycle [0, 1, 2, 1]
- Typing: advance every 0.3s, cycle [0, 1]
- Reading: advance every 0.3s, cycle [0, 1]
- Idle: frame always 1 (standing), direction = last known

Track delta time by storing previous timestamp in a ref.

- [ ] **Step 4: Compute direction from movement**

When an agent is moving between waypoints, compute direction from the movement delta:

```typescript
const computeDirection = (dx: number, dy: number): "down" | "up" | "right" | "left" => {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left"
  }
  return dy > 0 ? "down" : "up"
}
```

Seated agents (working/thinking) always face "down".

- [ ] **Step 5: Add palette index assignment with hue shift for 7+ agents**

```typescript
const paletteAssignmentsRef = useRef<Record<string, { paletteIndex: number; hueShift: number }>>({})
```

Assign on initial agent load. First 6 agents get unique palettes (no hue shift). Agent 7+ reuses least-used palette with random hue rotation 45-316 degrees:

```typescript
const HUE_SHIFT_MIN = 45
const HUE_SHIFT_RANGE = 271

const assignments: Record<string, { paletteIndex: number; hueShift: number }> = {}
const paletteCounts = Array(6).fill(0)

for (let i = 0; i < agentData.length; i++) {
  if (i < 6) {
    assignments[agentData[i].id] = { paletteIndex: i, hueShift: 0 }
    paletteCounts[i]++
  } else {
    const minCount = Math.min(...paletteCounts)
    const leastUsedIdx = paletteCounts.indexOf(minCount)
    const hueShift = HUE_SHIFT_MIN + Math.floor(Math.random() * HUE_SHIFT_RANGE)
    assignments[agentData[i].id] = { paletteIndex: leastUsedIdx, hueShift }
    paletteCounts[leastUsedIdx]++
  }
}
paletteAssignmentsRef.current = assignments
```

NOTE: When `hueShift > 0`, the sprite-loader needs a `adjustCharacterHue(sprites, hueShift)` function that rotates hue of every pixel in the character's SpriteData arrays. Add this function to `sprite-loader.ts`:

```typescript
export const adjustSpriteHue = (sprite: SpriteData, hueShiftDeg: number): SpriteData =>
  sprite.map((row) =>
    row.map((pixel) => {
      if (!pixel) return ""
      const [r, g, b] = hexToRgb(pixel)
      const [h, s, l] = rgbToHsl(r, g, b)
      return hslToHex((h + hueShiftDeg) % 360, s, l)
    })
  )
```

Hue-shifted character sprites should be cached per `paletteIndex:hueShift` key to avoid recomputing each frame.

- [ ] **Step 6: Expose animation data in getRenderPositions**

Change the return type to include animation state:

```typescript
type RenderAgent = {
  x: number
  y: number
  animation: AnimationType
  direction: "down" | "up" | "right" | "left"
  frame: number
  paletteIndex: number
}

export type { RenderAgent }
```

Update `getRenderPositions` to return `Record<string, RenderAgent>`.

- [ ] **Step 7: Do NOT commit yet**

Changing `getRenderPositions` return type breaks `providers.tsx` and `office-canvas.tsx`. Continue directly to Task 11 which updates those files. Commit all integration files together.

---

### Task 11: Update office-canvas.tsx

**Files:**
- Modify: `apps/web/lib/components/office-canvas.tsx`

Add asset loading on mount, pass AssetBundle to renderer.

- [ ] **Step 1: Add asset loading state**

```typescript
import { loadAllAssets, type AssetBundle } from "@/lib/canvas/sprite-loader"

const [assets, setAssets] = useState<AssetBundle | null>(null)
```

- [ ] **Step 2: Load assets on mount**

```typescript
useEffect(() => {
  loadAllAssets().then(setAssets)
}, [])
```

- [ ] **Step 3: Show loading state on canvas**

Before assets are loaded, draw "Loading..." text on the canvas:

```typescript
if (!assets) {
  ctx.fillStyle = "#e5dfd3"
  ctx.font = "16px monospace"
  ctx.textAlign = "center"
  ctx.fillText("Loading office...", CANVAS_CONFIG.baseWidth / 2, CANVAS_CONFIG.baseHeight / 2)
  return
}
```

- [ ] **Step 4: Pass assets to renderOffice**

Update the render call:

```typescript
renderOffice(ctx, animatedAgents, assets, CANVAS_CONFIG.baseWidth, CANVAS_CONFIG.baseHeight)
```

Where `animatedAgents` now maps the render positions (including animation state) from `getRenderPositions()` into the `AgentRenderData` format expected by the new renderer.

- [ ] **Step 5: Update providers.tsx if needed**

If the `getRenderPositions` return type changed, update the `OfficeContextType` in `providers.tsx` accordingly.

- [ ] **Step 6: Verify it compiles**

Run: `pnpm -F @ozap-office/web typecheck`

- [ ] **Step 7: Verify the dev server starts**

Run: `pnpm dev:web`

Open http://localhost:3000 — should see "Loading office..." then the sprite-rendered office. Characters should animate (walk cycle during meetings, typing when working, idle otherwise).

- [ ] **Step 8: Commit all integration files together** (includes Task 10 use-agents changes)

```bash
git add apps/web/lib/use-agents.ts apps/web/lib/components/office-canvas.tsx apps/web/app/providers.tsx
git commit -m "feat: wire animation state and asset loading into canvas"
```

---

### Task 12: Visual Tuning and Cleanup

**Files:**
- Modify: various (tuning parameters)

- [ ] **Step 1: Verify all furniture renders correctly**

Check each furniture item in the office. If any shows magenta placeholder, check the manifest path and PNG file name.

- [ ] **Step 2: Tune floor colors per room**

Adjust the HSL values in `colorize.ts` `ROOM_FLOOR_COLORS` until each room looks distinct and visually pleasing. The initial values are starting points — expect iteration.

- [ ] **Step 3: Tune wall color**

Adjust `WALL_COLOR` in `colorize.ts` to match the aesthetic.

- [ ] **Step 4: Verify meeting walk animation**

Call a meeting and verify:
- Agents use walk animation (cycling frames) while moving
- Direction changes as they turn
- They stop at meeting seats and show idle animation facing down

- [ ] **Step 5: Verify status bubbles**

- Working agent → typing animation + amber "..." bubble
- Thinking agent → reading animation + amber "..." bubble
- has_report agent → idle + green check bubble
- error agent → idle + red X bubble

- [ ] **Step 6: Run typecheck**

Run: `pnpm -F @ozap-office/web typecheck`
Expected: PASS

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete sprite visual overhaul"
```
