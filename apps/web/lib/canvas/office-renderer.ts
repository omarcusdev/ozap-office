import { gridToScreen, CANVAS_CONFIG } from "./isometric"
import { OFFICE_MAP, GRID, ROOM_LABELS } from "./tile-map"
import { drawTile, drawAgent, drawRoomLabel } from "./sprite-manager"
import type { AgentStatus } from "@ozap-office/shared"

type AgentRenderData = {
  id: string
  name: string
  color: string
  positionX: number
  positionY: number
  status: AgentStatus
}

type ClickResult =
  | { type: "agent"; agentId: string }
  | { type: "meeting_room" }
  | { type: "none" }

export const renderOffice = (
  ctx: CanvasRenderingContext2D,
  agents: AgentRenderData[],
  canvasWidth: number,
  canvasHeight: number
) => {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  const agentPositions = new Set(
    agents.map((a) => `${a.positionX},${a.positionY}`)
  )

  for (let y = 0; y < GRID.height; y++) {
    for (let x = 0; x < GRID.width; x++) {
      const tile = OFFICE_MAP[y][x]
      if (tile.type === "empty") continue

      if (tile.type === "chair" && agentPositions.has(`${x},${y}`)) continue

      const { x: sx, y: sy } = gridToScreen(x, y)
      drawTile(ctx, sx, sy, tile.type, tile.room, tile.variant)
    }
  }

  for (const label of ROOM_LABELS) {
    const { x: sx, y: sy } = gridToScreen(label.gridX, label.gridY)
    drawRoomLabel(ctx, sx, sy, label.text)
  }

  for (const agent of agents) {
    const sx = agent.positionX * CANVAS_CONFIG.tileSize
    const sy = agent.positionY * CANVAS_CONFIG.tileSize
    const gridX = Math.round(agent.positionX)
    const gridY = Math.round(agent.positionY)
    const isMoving = Math.abs(agent.positionX - gridX) > 0.05 || Math.abs(agent.positionY - gridY) > 0.05
    const tile = OFFICE_MAP[gridY]?.[gridX]
    const isOnChair = !isMoving && tile?.type === "chair"
    drawAgent(ctx, sx, sy, agent.color, agent.name, agent.status, isOnChair, tile?.room ?? null)
  }
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
