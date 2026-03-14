const TILE_WIDTH = 64
const TILE_HEIGHT = 32

export const isoToScreen = (tileX: number, tileY: number): { x: number; y: number } => ({
  x: (tileX - tileY) * (TILE_WIDTH / 2),
  y: (tileX + tileY) * (TILE_HEIGHT / 2),
})

export const screenToIso = (screenX: number, screenY: number): { x: number; y: number } => ({
  x: Math.floor((screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2),
  y: Math.floor((screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2),
})

export const CANVAS_CONFIG = {
  tileWidth: TILE_WIDTH,
  tileHeight: TILE_HEIGHT,
  baseWidth: 960,
  baseHeight: 640,
  offsetX: 480,
  offsetY: 80,
}
