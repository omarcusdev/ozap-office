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
