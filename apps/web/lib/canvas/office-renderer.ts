import type { AgentStatus } from "@ozap-office/shared"
import type { AssetBundle, Direction, BubbleType } from "./sprite-loader"
import type { FurniturePlacement } from "./tile-map"
import type { AnimationType } from "./sprite-manager"
import { OFFICE_MAP, GRID, ROOM_LABELS, FURNITURE_PLACEMENTS, WALL_BITMASKS, OPEN_OFFICE_DESK_POSITIONS } from "./tile-map"
import { gridToScreen, CANVAS_CONFIG } from "./coordinates"
import {
  drawFloorTile,
  drawGrassTile,
  drawPathTile,
  drawWallTile,
  drawCharacter,
  drawFurniture,
  drawBubble,
  drawNameLabel,
  drawRoomLabel,
} from "./sprite-manager"

export type AgentRenderData = {
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

type ClickResult =
  | { type: "agent"; agentId: string }
  | { type: "meeting_room" }
  | { type: "none" }

type ZDrawable =
  | { kind: "wall"; gridX: number; gridY: number; zY: number; bitmask: number }
  | { kind: "furniture"; placement: FurniturePlacement; zY: number }
  | { kind: "character"; agent: AgentRenderData; zY: number; seated: boolean }

const STATUS_TO_BUBBLE: Partial<Record<AgentStatus, BubbleType>> = {
  working: "working",
  thinking: "working",
  has_report: "done",
  waiting: "waiting",
  error: "error",
}

const DESK_ROW_TO_CHAIR_ROW_OFFSET = 1

const buildAgentDeskLookup = (agents: AgentRenderData[]): Set<number> => {
  const occupiedDeskIndices = new Set<number>()
  for (const agent of agents) {
    if (agent.status !== "working" && agent.status !== "thinking") continue
    const chairGridY = Math.round(agent.positionY)
    const chairGridX = Math.round(agent.positionX)
    for (let i = 0; i < OPEN_OFFICE_DESK_POSITIONS.length; i++) {
      const desk = OPEN_OFFICE_DESK_POSITIONS[i]
      if (desk.gridX === chairGridX && desk.gridY === chairGridY) {
        occupiedDeskIndices.add(i)
        break
      }
    }
  }
  return occupiedDeskIndices
}

const resolvePcState = (
  placement: FurniturePlacement,
  occupiedDeskIndices: Set<number>
): FurniturePlacement => {
  if (placement.id !== "PC") return placement

  const deskGridY = placement.gridY + DESK_ROW_TO_CHAIR_ROW_OFFSET
  for (let i = 0; i < OPEN_OFFICE_DESK_POSITIONS.length; i++) {
    const desk = OPEN_OFFICE_DESK_POSITIONS[i]
    if (desk.gridX === placement.gridX && desk.gridY === deskGridY) {
      return occupiedDeskIndices.has(i)
        ? { ...placement, state: "on" }
        : placement
    }
  }
  return placement
}

const isAgentSeated = (agent: AgentRenderData): boolean => {
  const gridX = Math.round(agent.positionX)
  const gridY = Math.round(agent.positionY)
  const isMoving = Math.abs(agent.positionX - gridX) > 0.05 || Math.abs(agent.positionY - gridY) > 0.05
  if (isMoving) return false

  const tile = OFFICE_MAP[gridY]?.[gridX]
  if (!tile || tile.type !== "floor") return false

  for (const furniture of FURNITURE_PLACEMENTS) {
    if (furniture.id === "CUSHIONED_CHAIR" && furniture.gridX === gridX && furniture.gridY === gridY) {
      return true
    }
  }
  return false
}

const drawFloorLayer = (ctx: CanvasRenderingContext2D, assets: AssetBundle) => {
  for (let y = 0; y < GRID.height; y++) {
    for (let x = 0; x < GRID.width; x++) {
      const tile = OFFICE_MAP[y][x]
      if (tile.type === "floor" && tile.room) {
        drawFloorTile(ctx, x, y, tile.room, assets)
      } else if (tile.type === "grass") {
        drawGrassTile(ctx, x, y, assets, tile.variant ?? 0)
      } else if (tile.type === "path") {
        drawPathTile(ctx, x, y, assets)
      }
    }
  }
}

const collectZDrawables = (agents: AgentRenderData[], occupiedDeskIndices: Set<number>): ZDrawable[] => {
  const drawables: ZDrawable[] = []

  for (let y = 0; y < GRID.height; y++) {
    for (let x = 0; x < GRID.width; x++) {
      const tile = OFFICE_MAP[y][x]
      if (tile.type === "wall") {
        drawables.push({
          kind: "wall",
          gridX: x,
          gridY: y,
          zY: y,
          bitmask: WALL_BITMASKS[y][x],
        })
      }
    }
  }

  for (const placement of FURNITURE_PLACEMENTS) {
    const resolved = resolvePcState(placement, occupiedDeskIndices)
    drawables.push({
      kind: "furniture",
      placement: resolved,
      zY: placement.gridY,
    })
  }

  for (const agent of agents) {
    const seated = isAgentSeated(agent)
    drawables.push({
      kind: "character",
      agent,
      zY: agent.positionY,
      seated,
    })
  }

  drawables.sort((a, b) => a.zY - b.zY)
  return drawables
}

const drawZSortedLayer = (
  ctx: CanvasRenderingContext2D,
  drawables: ZDrawable[],
  assets: AssetBundle
) => {
  for (const drawable of drawables) {
    if (drawable.kind === "wall") {
      drawWallTile(ctx, drawable.gridX, drawable.gridY, drawable.bitmask, assets)
    } else if (drawable.kind === "furniture") {
      drawFurniture(ctx, drawable.placement, assets)
    } else if (drawable.kind === "character") {
      const { agent, seated } = drawable
      const sx = agent.positionX * CANVAS_CONFIG.tileSize
      const sy = agent.positionY * CANVAS_CONFIG.tileSize
      drawCharacter(ctx, sx, sy, agent.paletteIndex, agent.animation, agent.direction, agent.frame, seated, assets)
    }
  }
}

const drawOverlayLayer = (
  ctx: CanvasRenderingContext2D,
  drawables: ZDrawable[],
  assets: AssetBundle
) => {
  for (const drawable of drawables) {
    if (drawable.kind !== "character") continue

    const { agent, seated } = drawable
    const sx = agent.positionX * CANVAS_CONFIG.tileSize
    const sy = agent.positionY * CANVAS_CONFIG.tileSize

    const bubbleType = STATUS_TO_BUBBLE[agent.status]
    if (bubbleType) {
      drawBubble(ctx, sx, sy, bubbleType, seated, assets)
    }

    drawNameLabel(ctx, sx, sy, agent.name, agent.status)
  }

  for (const label of ROOM_LABELS) {
    const { x: sx, y: sy } = gridToScreen(label.gridX, label.gridY)
    drawRoomLabel(ctx, sx, sy, label.text)
  }
}

export const renderOffice = (
  ctx: CanvasRenderingContext2D,
  agents: AgentRenderData[],
  assets: AssetBundle,
  canvasWidth: number,
  canvasHeight: number
) => {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  const occupiedDeskIndices = buildAgentDeskLookup(agents)

  drawFloorLayer(ctx, assets)

  const drawables = collectZDrawables(agents, occupiedDeskIndices)
  drawZSortedLayer(ctx, drawables, assets)
  drawOverlayLayer(ctx, drawables, assets)
}

export const hitTest = (
  clickX: number,
  clickY: number,
  agents: AgentRenderData[]
): ClickResult => {
  const { tileSize } = CANVAS_CONFIG

  for (const agent of agents) {
    const { x: sx, y: sy } = gridToScreen(agent.positionX, agent.positionY)
    const ax = sx + tileSize / 2
    const ay = sy + tileSize / 2
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
