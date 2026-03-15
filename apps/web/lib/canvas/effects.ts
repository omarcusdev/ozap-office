const MATRIX_DURATION_MS = 300
const MATRIX_SPRITE_ROWS = 32
const TRAIL_LENGTH = 6
const HEAD_COLOR = "#ccffcc"
const BASE_GREEN = [0, 200, 0] as const

export type MatrixEffectState = {
  startTime: number
  direction: "spawn" | "despawn"
  columnStagger: number[]
}

const generateColumnStagger = (columnCount: number): number[] =>
  Array.from({ length: columnCount }, () => Math.random() * 0.3)

export const createMatrixEffect = (
  direction: "spawn" | "despawn",
  spriteWidth: number
): MatrixEffectState => ({
  startTime: performance.now(),
  direction,
  columnStagger: generateColumnStagger(spriteWidth),
})

export const isMatrixEffectActive = (state: MatrixEffectState): boolean =>
  performance.now() - state.startTime < MATRIX_DURATION_MS

const hashFlicker = (col: number, row: number, time: number): number => {
  const seed = (col * 73856093 + row * 19349663 + Math.floor(time * 0.01) * 83492791) >>> 0
  return (seed % 256) / 255
}

export const renderMatrixEffect = (
  ctx: CanvasRenderingContext2D,
  state: MatrixEffectState,
  screenX: number,
  screenY: number,
  spriteWidth: number,
  pixelScale: number
) => {
  const elapsed = performance.now() - state.startTime
  const globalProgress = Math.min(elapsed / MATRIX_DURATION_MS, 1)

  for (let col = 0; col < spriteWidth; col++) {
    const stagger = state.columnStagger[col] ?? 0
    const columnProgress = Math.max(0, Math.min(1, (globalProgress - stagger) / (1 - stagger)))
    const sweepRow = state.direction === "spawn"
      ? Math.floor(columnProgress * MATRIX_SPRITE_ROWS)
      : MATRIX_SPRITE_ROWS - Math.floor(columnProgress * MATRIX_SPRITE_ROWS)

    for (let row = 0; row < MATRIX_SPRITE_ROWS; row++) {
      const isVisible = state.direction === "spawn" ? row <= sweepRow : row >= sweepRow
      if (!isVisible) continue

      const distanceFromHead = state.direction === "spawn"
        ? sweepRow - row
        : row - sweepRow

      if (distanceFromHead === 0) {
        ctx.fillStyle = HEAD_COLOR
        ctx.fillRect(
          screenX + col * pixelScale,
          screenY + row * pixelScale,
          pixelScale,
          pixelScale
        )
      } else if (distanceFromHead > 0 && distanceFromHead <= TRAIL_LENGTH) {
        const trailFade = 1 - distanceFromHead / TRAIL_LENGTH
        const flicker = hashFlicker(col, row, elapsed)
        const alpha = trailFade * 0.6 * (0.5 + flicker * 0.5)
        const [r, g, b] = BASE_GREEN
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.fillRect(
          screenX + col * pixelScale,
          screenY + row * pixelScale,
          pixelScale,
          pixelScale
        )
      }
    }
  }
}
