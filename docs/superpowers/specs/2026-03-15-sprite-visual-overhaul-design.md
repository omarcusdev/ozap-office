# Sprite-Based Visual Overhaul

Replace all procedural Canvas 2D drawing with PNG sprite rendering, adopting assets and rendering techniques from [pixel-agents](https://github.com/pablodelucca/pixel-agents) (MIT license).

## Context

The current office renders entirely with Canvas `fillRect` calls — characters are 20x28px rectangles, furniture is geometric shapes, floors have procedural grain patterns. pixel-agents uses real pixel art PNG sprites with animations, colorizable tiles, and visual effects. This spec ports their visual system into ozap-office while preserving the entire backend and frontend state management.

## Decisions

- **Perspective**: Top-down orthographic. Both projects already use this despite ozap-office naming its file `isometric.ts` (rename to `coordinates.ts`).
- **Tile size**: Keep 32px grid. Render 16px sprites at 2x scale. Canvas stays 960x640 (30x20 tiles). This avoids cascading changes to grid dimensions, hit-testing, meeting routes, and desk positions.
- **Office layout**: Keep existing room structure (boss office, open office, meeting room, hallway, outdoor). Replace procedural furniture with sprite equivalents.
- **Assets**: Use pixel-agents' MIT-licensed PNGs directly (characters, floors, walls, furniture)
- **Zoom**: No zoom feature. Single scale (2x). Sprite cache keyed by scale factor for future extensibility but only one scale used now.
- **No sounds, no office editor** — out of scope

## Asset Pipeline

### Loading Lifecycle

All sprites preload before the first frame renders. A loading state is shown while assets load (~41 PNG files: 6 characters + 9 floors + 1 wall + ~25 furniture). The `sprite-loader.ts` module exports an async `loadAllAssets()` function that returns a typed `AssetBundle` containing all parsed SpriteData. `office-canvas.tsx` calls this on mount, renders a simple "Loading..." text on the canvas until resolved.

If any individual PNG fails to load, it is skipped with a console warning. The renderer draws a magenta placeholder rectangle for any missing sprite (standard game dev convention for missing assets).

### Conversion Pipeline

1. `Image()` element loads PNG from `public/assets/`
2. Draw to temporary canvas, call `getImageData()` to extract RGBA pixel data
3. Convert to `SpriteData` format: `string[][]` where `''` = transparent (alpha < 2), `'#RRGGBB'` = opaque
4. Cache rendered sprites as `OffscreenCanvas` at 2x scale via `WeakMap<SpriteData, OffscreenCanvas>`
5. Main renderer calls `ctx.drawImage(cachedCanvas, x, y)` to blit

## Character System

### Sprite Sheets

6 pre-colored character PNGs (`char_0.png` through `char_5.png`), each 112x96px containing:
- 7 frames across x 3 direction rows (down, up, right)
- Frame size: 16x32px
- Left direction: right frames mirrored horizontally at runtime

### Animation Cycles

| Animation | Frames | Duration per frame |
|-----------|--------|--------------------|
| Walk | 4-frame cycle [0, 1, 2, 1] | 0.15s |
| Typing | 2-frame cycle [3, 4] | 0.3s |
| Reading | 2-frame cycle [5, 6] | 0.3s |
| Idle | Static frame walk[1] | — |

### Agent Status to Animation Mapping

| Agent Status | Animation | Direction | Speech Bubble |
|-------------|-----------|-----------|---------------|
| idle | Idle (standing) | Last known direction | None |
| working | Typing | Down (facing camera) | "..." amber dots |
| thinking | Reading | Down (facing camera) | "..." amber dots |
| meeting | Walk cycle during movement, Idle when seated | Movement direction, then Down | None |
| has_report | Idle (standing) | Last known direction | Green checkmark |
| waiting | Idle (standing) | Last known direction | "!" amber |
| error | Idle (standing) | Last known direction | Red X |

Seated agents (working, thinking) use the "down" direction row so they face the camera. The typing/reading frames already show a seated posture.

### Palette Diversity

First 6 agents each get a unique palette with no hue shift applied — they use the base colors from their respective PNG. Agent 7+ reuses the least-used palette with a random hue rotation between 45-316 degrees. Hue shifting converts each pixel to HSL, rotates hue, converts back. Adjusted sprites cached by `paletteIndex:hueShift` key.

## Tile System

### Tile Size Strategy

pixel-agents uses 16px tiles. ozap-office uses 32px tiles. Rather than changing the grid system, all 16px sprites render at 2x scale within 32px cells. This means:
- Floor tile 16x16 → renders as 32x32 on canvas
- Wall piece 16x32 → renders as 32x64 on canvas (extends 32px above cell)
- Character frame 16x32 → renders as 32x64 on canvas
- Furniture sprites scale proportionally (e.g., a 32x16 sprite → 64x32 on canvas)

The grid remains 30x20 at 32px per cell. All existing coordinate math, hit-testing, meeting routes, and desk positions work unchanged.

### Floors

9 grayscale PNG patterns (16x16px each: `floor_0.png` through `floor_8.png`). Colorized at runtime using Photoshop-style Colorize algorithm:
1. Parse pixel luminance (perceived: 0.299R + 0.587G + 0.114B)
2. Apply contrast (expand/compress around 0.5)
3. Apply brightness shift
4. Create HSL color with configured hue + saturation

Each room gets a floor pattern index and color config:
- Boss office: floor_0, warm wood tone (h: 30, s: 0.4, b: 0.1, c: 0.2)
- Open office: floor_2, neutral gray tile (h: 200, s: 0.1, b: 0.0, c: 0.0)
- Meeting room: floor_4, carpet tone (h: 220, s: 0.3, b: -0.1, c: 0.1)
- Hallway: floor_1, light tile (h: 40, s: 0.15, b: 0.1, c: 0.0)
- Outdoor: floor_5, green/earth tones (h: 120, s: 0.3, b: -0.1, c: 0.1)

Exact HSL values will be tuned during implementation. These are starting points.

### Walls

Single 64x128px PNG containing 4x4 grid of 16x32px wall pieces. The current manual wall placement (`wall_top`, `wall_left`, `wall_right`, etc.) is replaced with auto-tiling:

1. The tile map marks cells as `wall` (single type, no directional variants)
2. At render time, each wall cell checks its 4 cardinal neighbors for other wall cells
3. Bitmask (N=1, E=2, S=4, W=8) produces index 0-15 selecting the correct piece from the tileset
4. Wall pieces are 16x32 (32x64 at 2x), anchored at tile bottom so they extend upward

This simplifies the tile map from 11 wall types to 1. The auto-tiling algorithm runs once when the tile map is initialized, not per frame.

## Furniture

### Manifest Schema

Each furniture item lives in `public/assets/furniture/<NAME>/` with a `manifest.json` and PNG files. Example (simple item):

```json
{
  "id": "BOOKSHELF",
  "name": "Bookshelf",
  "type": "asset",
  "width": 32,
  "height": 16,
  "footprintW": 2,
  "footprintH": 1
}
```

Example (item with rotation and state):

```json
{
  "id": "PC",
  "name": "PC",
  "type": "group",
  "groupType": "rotation",
  "members": [
    {
      "type": "group",
      "groupType": "state",
      "orientation": "front",
      "members": [
        {
          "type": "group",
          "groupType": "animation",
          "state": "on",
          "members": [
            { "type": "asset", "id": "PC_FRONT_ON_1", "file": "PC_FRONT_ON_1.png", "width": 16, "height": 32 },
            { "type": "asset", "id": "PC_FRONT_ON_2", "file": "PC_FRONT_ON_2.png", "width": 16, "height": 32 }
          ]
        },
        { "type": "asset", "id": "PC_FRONT_OFF", "state": "off", "file": "PC_FRONT_OFF.png", "width": 16, "height": 32 }
      ]
    }
  ]
}
```

Key fields:
- `type`: `"asset"` (single sprite) or `"group"` (container)
- `groupType`: `"rotation"` (orientation variants), `"state"` (on/off), `"animation"` (frame cycle)
- `width`/`height`: sprite dimensions in pixels (before 2x scaling)
- `footprintW`/`footprintH`: how many grid cells the item occupies

### Mapping from Current to Sprite

| Current (procedural) | New (PNG sprite) | Notes |
|---------------------|-----------------|-------|
| desk + monitor | DESK + PC | PC has on/off state + animation |
| chair | CUSHIONED_CHAIR | Front orientation at desks |
| plant | PLANT / LARGE_PLANT / CACTUS | Variety per position |
| bookshelf | BOOKSHELF / DOUBLE_BOOKSHELF | Wall-mounted |
| whiteboard | WHITEBOARD | — |
| table (meeting) | TABLE_FRONT / SMALL_TABLE | — |
| coffee_machine | COFFEE | On/off state |
| rug | Floor tile color variation | No separate sprite needed |

### New Decorations (specific placements)

- SOFA in boss office (near wall, opposite desk)
- LARGE_PAINTING on boss office wall
- SMALL_PAINTING on meeting room wall
- CLOCK on hallway wall
- HANGING_PLANT in open office area

### PC On/Off State

PCs switch to "on" state when the agent assigned to that desk has status `working` or `thinking`. This is status-based, not proximity-based — each desk position maps to an agent, and the PC at that desk responds to that agent's status.

## Visual Effects

### Matrix Spawn/Despawn

When agents appear or disappear, a 0.3s green digital rain effect plays:
- Per-pixel column rendering with random stagger seed per column
- "Head" pixel sweeps top-to-bottom: bright `#ccffcc`
- Trail zone (6 rows behind head): character pixels with fading green overlay
- Hash-based flicker: `(col*7 + row*13 + floor(time*30)*31) & 0xFF < 180` for ~70% visibility shimmer
- Spawn: reveals character top-to-bottom
- Despawn: consumes character top-to-bottom

Triggers: agent comes online/offline, meeting transitions.

### Speech Bubbles

Pixel-art bubble sprites (11x13px, rendered at 2x = 22x26px) above characters. Defined as JSON palette-keyed sprite data:

```json
{ "palette": { "_": "", "B": "#555566", "F": "#EEEEFF", "A": "#CCA700" }, "pixels": [...] }
```

Bubble vertical offset: 48px above character (at 2x scale). Add 12px when seated.

We define 4 bubble variants:
- **Working bubble**: amber "..." dots (for working/thinking status)
- **Done bubble**: green checkmark (for has_report status)
- **Waiting bubble**: amber "!" (for waiting status), fades out over last 0.5s
- **Error bubble**: red "X" (for error status)

Idle agents show no bubble.

### Room Labels

Current procedural room labels ("BOSS OFFICE", "OPEN OFFICE", etc.) are kept as Canvas text overlays, rendered after all sprites. They are not part of the sprite system.

## Z-Sorting

All visible entities (furniture, walls, characters) are collected into a flat array of `ZDrawable` items, each with a `zY` sort value based on their Y position. Array is sorted ascending by `zY` and drawn in order, producing correct depth overlap.

- Characters: `zY = y + TILE_SIZE/2 + 0.5`
- Furniture: `zY = (row + 1) * TILE_SIZE`
- Walls: same as furniture (converted to furniture instances)

## Hit Testing

Stays grid-based. Click coordinates divide by TILE_SIZE (32px) to get grid cell. Agent detection checks if click is within the agent's grid cell (same as current circle-based approach but using the 32px cell bounds). Meeting room detection checks room boundaries. No change in approach — sprite size differences are absorbed by the 32px grid cell.

## Files Changed

### Rewrites

| File | Change |
|------|--------|
| `canvas/sprite-manager.ts` | Full rewrite — sprite-based rendering replacing all `draw*()` functions |
| `canvas/tile-map.ts` | Simplified tile types (floor variants + single `wall` type), keep room structure, desk positions, and meeting routes |
| `canvas/office-renderer.ts` | Z-sorted sprite blitting, new render pipeline with preload gate |
| `canvas/isometric.ts` → `canvas/coordinates.ts` | Rename, keep 32px TILE_SIZE, same grid-to-screen math |

### Edits

| File | Change |
|------|--------|
| `components/office-canvas.tsx` | Call `loadAllAssets()` on mount, show loading state, pass AssetBundle to renderer |
| `use-agents.ts` | Add per-agent animation state: current frame index, frame timer, animation type (walk/type/read/idle). Update frame cycling in the existing `requestAnimationFrame` loop based on delta time and frame durations. Meeting walk animation syncs walk cycle frames with position interpolation. |

### New Files

| File | Purpose |
|------|---------|
| `canvas/sprite-loader.ts` | Async `loadAllAssets(): Promise<AssetBundle>` — loads all PNGs, converts to SpriteData, returns typed bundle |
| `canvas/sprite-cache.ts` | `getCachedSprite(sprite: SpriteData, scale: number): OffscreenCanvas` — renders SpriteData at given scale, caches via WeakMap |
| `canvas/colorize.ts` | `colorizeSprite(sprite: SpriteData, h, s, b, c): SpriteData` — HSL Photoshop-style Colorize |
| `canvas/effects.ts` | `renderMatrixEffect(ctx, sprite, progress, mode)` + `renderBubble(ctx, type, x, y)` |
| `public/assets/characters/` | 6 character sprite sheets (char_0.png — char_5.png) |
| `public/assets/floors/` | 9 floor tile patterns (floor_0.png — floor_8.png) |
| `public/assets/walls/` | Wall tileset PNG (wall_0.png) |
| `public/assets/furniture/` | Furniture items with manifest.json + PNGs per item |
| `public/assets/bubbles/` | Speech bubble JSON sprite definitions |

## What Does NOT Change

- Backend: Bedrock Converse API, cron scheduling, meetings, approvals, tool system, WebSocket, event bus, database
- Frontend state: useWebSocket, useEvents, ThoughtPanel, StatusBar, providers/context
- Office layout structure: same rooms, same desk positions, same meeting routes (coordinates unchanged because grid stays 30x20 at 32px)
- API: all routes, authentication, WebSocket protocol
- Canvas base dimensions: 960x640
