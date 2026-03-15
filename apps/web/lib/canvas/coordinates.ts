const TILE_SIZE = 32

export const gridToScreen = (gridX: number, gridY: number): { x: number; y: number } => ({
  x: gridX * TILE_SIZE,
  y: gridY * TILE_SIZE,
})

export const screenToGrid = (screenX: number, screenY: number): { x: number; y: number } => ({
  x: Math.floor(screenX / TILE_SIZE),
  y: Math.floor(screenY / TILE_SIZE),
})

export const CANVAS_CONFIG = {
  tileSize: TILE_SIZE,
  baseWidth: 960,
  baseHeight: 640,
  gridWidth: 30,
  gridHeight: 20,
}
