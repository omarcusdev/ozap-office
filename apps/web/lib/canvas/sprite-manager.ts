import type { AgentStatus } from "@ozap-office/shared"
import type { SpriteData, AssetBundle, Direction, BubbleType, FurnitureManifest } from "./sprite-loader"
import type { RoomType, FurniturePlacement } from "./tile-map"
import { gridToScreen, CANVAS_CONFIG } from "./coordinates"
import { getCachedSprite, getPlaceholderSprite, SPRITE_SCALE } from "./sprite-cache"
import { colorizeSprite, ROOM_FLOOR_COLORS, WALL_COLOR } from "./colorize"

export type AnimationType = "walk" | "typing" | "reading"

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#888888",
  working: "#50fa7b",
  thinking: "#f1fa8c",
  waiting: "#ffb86c",
  meeting: "#bd93f9",
  error: "#ff5555",
  has_report: "#ffb86c",
}

const WALK_FRAME_SEQUENCE = [0, 1, 2, 1] as const

const colorizedFloorCache = new Map<string, SpriteData>()
const colorizedWallCache = new Map<string, SpriteData>()

const getColorizedFloor = (assets: AssetBundle, room: RoomType): SpriteData | null => {
  const cacheKey = `floor:${room}`
  const cached = colorizedFloorCache.get(cacheKey)
  if (cached) return cached

  const config = ROOM_FLOOR_COLORS[room]
  if (!config) return null

  const baseSprite = assets.floors[config.floorIndex]
  if (!baseSprite) return null

  const colorized = colorizeSprite(baseSprite, config.color)
  colorizedFloorCache.set(cacheKey, colorized)
  return colorized
}

const getColorizedWall = (assets: AssetBundle, bitmask: number): SpriteData | null => {
  const cacheKey = `wall:${bitmask}`
  const cached = colorizedWallCache.get(cacheKey)
  if (cached) return cached

  const piece = assets.wallTileset[bitmask]
  if (!piece) return null

  const colorized = colorizeSprite(piece, WALL_COLOR)
  colorizedWallCache.set(cacheKey, colorized)
  return colorized
}

export const drawFloorTile = (
  ctx: CanvasRenderingContext2D,
  gridX: number,
  gridY: number,
  room: RoomType,
  assets: AssetBundle
) => {
  const sprite = getColorizedFloor(assets, room)
  if (!sprite) return

  const { x: sx, y: sy } = gridToScreen(gridX, gridY)
  const cached = getCachedSprite(sprite)
  ctx.drawImage(cached, sx, sy, CANVAS_CONFIG.tileSize, CANVAS_CONFIG.tileSize)
}

export const drawGrassTile = (
  ctx: CanvasRenderingContext2D,
  gridX: number,
  gridY: number,
  assets: AssetBundle,
  variant: number
) => {
  const config = ROOM_FLOOR_COLORS["outdoor"]
  if (!config) return

  const baseIndex = config.floorIndex + (variant % 3)
  const baseSprite = assets.floors[baseIndex]
  if (!baseSprite) return

  const cacheKey = `grass:${baseIndex}`
  const existing = colorizedFloorCache.get(cacheKey)
  const colorized = existing ?? colorizeSprite(baseSprite, config.color)
  if (!existing) colorizedFloorCache.set(cacheKey, colorized)

  const { x: sx, y: sy } = gridToScreen(gridX, gridY)
  const cached = getCachedSprite(colorized)
  ctx.drawImage(cached, sx, sy, CANVAS_CONFIG.tileSize, CANVAS_CONFIG.tileSize)
}

export const drawPathTile = (
  ctx: CanvasRenderingContext2D,
  gridX: number,
  gridY: number,
  assets: AssetBundle
) => {
  const config = ROOM_FLOOR_COLORS["hallway"]
  if (!config) return

  const baseSprite = assets.floors[config.floorIndex]
  if (!baseSprite) return

  const cacheKey = "path:hallway"
  const existing = colorizedFloorCache.get(cacheKey)
  const colorized = existing ?? colorizeSprite(baseSprite, config.color)
  if (!existing) colorizedFloorCache.set(cacheKey, colorized)

  const { x: sx, y: sy } = gridToScreen(gridX, gridY)
  const cached = getCachedSprite(colorized)
  ctx.drawImage(cached, sx, sy, CANVAS_CONFIG.tileSize, CANVAS_CONFIG.tileSize)
}

export const drawWallTile = (
  ctx: CanvasRenderingContext2D,
  gridX: number,
  gridY: number,
  bitmask: number,
  assets: AssetBundle
) => {
  const sprite = getColorizedWall(assets, bitmask)
  if (!sprite) return

  const { x: sx, y: sy } = gridToScreen(gridX, gridY)
  const cached = getCachedSprite(sprite)
  const spriteHeight = sprite.length * SPRITE_SCALE
  const anchorY = sy + CANVAS_CONFIG.tileSize - spriteHeight
  ctx.drawImage(cached, sx, anchorY)
}

const resolveCharacterFrame = (
  assets: AssetBundle,
  paletteIndex: number,
  animation: AnimationType,
  direction: Direction,
  frame: number
): SpriteData | null => {
  const charSprites = assets.characters[paletteIndex]
  if (!charSprites) return null

  const animGroup = charSprites[animation]
  if (!animGroup) return null

  const dirFrames = animGroup[direction]
  if (!dirFrames || dirFrames.length === 0) return null

  if (animation === "walk") {
    const mappedFrame = WALK_FRAME_SEQUENCE[frame % WALK_FRAME_SEQUENCE.length]
    return dirFrames[mappedFrame] ?? dirFrames[0]
  }

  return dirFrames[frame % dirFrames.length] ?? dirFrames[0]
}

export const drawCharacter = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  paletteIndex: number,
  animation: AnimationType,
  direction: Direction,
  frame: number,
  seated: boolean,
  assets: AssetBundle
) => {
  const sprite = resolveCharacterFrame(assets, paletteIndex, animation, direction, frame)
  if (!sprite) {
    const placeholder = getPlaceholderSprite()
    ctx.drawImage(placeholder, screenX, screenY)
    return
  }

  const cached = getCachedSprite(sprite)
  const spriteWidth = cached.width
  const spriteHeight = cached.height
  const centerOffsetX = (CANVAS_CONFIG.tileSize - spriteWidth) / 2
  const seatedOffsetY = seated ? 4 * SPRITE_SCALE : 0
  const anchorY = screenY + CANVAS_CONFIG.tileSize - spriteHeight + seatedOffsetY
  ctx.drawImage(cached, screenX + centerOffsetX, anchorY)
}

const resolveFurnitureSprite = (
  assets: AssetBundle,
  placement: FurniturePlacement
): SpriteData | null => {
  const furnitureEntry = assets.furniture[placement.id]
  if (!furnitureEntry) return null

  const { manifest, sprites } = furnitureEntry
  return traverseManifestTree(manifest, sprites, placement)
}

const traverseManifestTree = (
  node: FurnitureManifest,
  sprites: Record<string, SpriteData>,
  placement: FurniturePlacement
): SpriteData | null => {
  if (node.type === "asset") {
    return sprites[node.id] ?? null
  }

  if (!node.members || node.members.length === 0) return null

  if (node.groupType === "rotation") {
    const targetOrientation = placement.orientation ?? "front"
    const match = node.members.find((m) => m.orientation === targetOrientation)
    return traverseManifestTree(match ?? node.members[0], sprites, placement)
  }

  if (node.groupType === "state") {
    const targetState = placement.state ?? "off"
    const match = node.members.find((m) => m.state === targetState)
    return traverseManifestTree(match ?? node.members[0], sprites, placement)
  }

  if (node.groupType === "animation") {
    return traverseManifestTree(node.members[0], sprites, placement)
  }

  return traverseManifestTree(node.members[0], sprites, placement)
}

export const drawFurniture = (
  ctx: CanvasRenderingContext2D,
  placement: FurniturePlacement,
  assets: AssetBundle
) => {
  const sprite = resolveFurnitureSprite(assets, placement)
  if (!sprite) return

  const { x: sx, y: sy } = gridToScreen(placement.gridX, placement.gridY)
  const cached = getCachedSprite(sprite)
  const spriteHeight = cached.height
  const anchorY = sy + CANVAS_CONFIG.tileSize - spriteHeight
  ctx.drawImage(cached, sx, anchorY)
}

const BUBBLE_OFFSET_Y = 48
const BUBBLE_SEATED_EXTRA = 12

export const drawBubble = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  bubbleType: BubbleType,
  seated: boolean,
  assets: AssetBundle
) => {
  const sprite = assets.bubbles[bubbleType]
  if (!sprite) return

  const cached = getCachedSprite(sprite)
  const offsetX = (CANVAS_CONFIG.tileSize - cached.width) / 2
  const offsetY = BUBBLE_OFFSET_Y + (seated ? BUBBLE_SEATED_EXTRA : 0)
  ctx.drawImage(cached, screenX + offsetX, screenY - offsetY)
}

export const drawNameLabel = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  name: string,
  status: AgentStatus
) => {
  const tileCenter = screenX + CANVAS_CONFIG.tileSize / 2
  const textWidth = name.length * 6 + 16
  const labelX = tileCenter - textWidth / 2
  const labelY = screenY + CANVAS_CONFIG.tileSize + 2

  ctx.fillStyle = "#00000055"
  ctx.fillRect(Math.round(labelX - 1), Math.round(labelY - 1), textWidth + 2, 13)
  ctx.fillStyle = "#ffffffee"
  ctx.fillRect(Math.round(labelX), Math.round(labelY), textWidth, 11)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(Math.round(labelX), Math.round(labelY), textWidth, 1)

  const dotColor = STATUS_COLORS[status]
  ctx.fillStyle = dotColor
  ctx.fillRect(Math.round(labelX + 3), Math.round(labelY + 3), 5, 5)

  ctx.fillStyle = "#111111"
  ctx.font = "bold 8px monospace"
  ctx.textAlign = "left"
  ctx.fillText(name, labelX + 11, labelY + 9)
}

export const drawRoomLabel = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  text: string
) => {
  const textWidth = text.length * 6 + 8
  const labelX = screenX - textWidth / 2 + 16
  const labelY = screenY + 6

  ctx.fillStyle = "#5a4a3a"
  ctx.fillRect(Math.round(labelX - 1), Math.round(labelY - 1), textWidth + 2, 14)
  ctx.fillStyle = "#f0e8d8"
  ctx.fillRect(Math.round(labelX), Math.round(labelY), textWidth, 12)

  ctx.fillStyle = "#5a4a3a"
  ctx.font = "bold 8px monospace"
  ctx.textAlign = "center"
  ctx.fillText(text, labelX + textWidth / 2, labelY + 9)
}

export { STATUS_COLORS }
