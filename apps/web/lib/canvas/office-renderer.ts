import { isoToScreen, CANVAS_CONFIG } from "./isometric"
import { OFFICE_MAP, GRID } from "./tile-map"
import { drawTile, drawAgent } from "./sprite-manager"
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

  const { tileWidth, tileHeight, offsetX, offsetY } = CANVAS_CONFIG

  for (let y = 0; y < GRID.height; y++) {
    for (let x = 0; x < GRID.width; x++) {
      const tile = OFFICE_MAP[y][x]
      if (tile.type === "empty") continue

      const { x: sx, y: sy } = isoToScreen(x, y)
      drawTile(ctx, sx + offsetX, sy + offsetY, tile.type, tileWidth, tileHeight)
    }
  }

  for (const agent of agents) {
    const { x: sx, y: sy } = isoToScreen(agent.positionX, agent.positionY)
    drawAgent(ctx, sx + offsetX, sy + offsetY, agent.color, agent.name, agent.status)
  }
}

export const hitTest = (
  clickX: number,
  clickY: number,
  agents: AgentRenderData[]
): ClickResult => {
  const { offsetX, offsetY } = CANVAS_CONFIG

  for (const agent of agents) {
    const { x: sx, y: sy } = isoToScreen(agent.positionX, agent.positionY)
    const ax = sx + offsetX
    const ay = sy + offsetY - 16
    const distance = Math.sqrt((clickX - ax) ** 2 + (clickY - ay) ** 2)
    if (distance < 20) return { type: "agent", agentId: agent.id }
  }

  for (let y = 5; y < 10; y++) {
    for (let x = 0; x < 5; x++) {
      const tile = OFFICE_MAP[y][x]
      if (tile.room !== "meeting_room") continue
      const { x: sx, y: sy } = isoToScreen(x, y)
      const tx = sx + offsetX
      const ty = sy + offsetY
      if (Math.abs(clickX - tx) < 32 && Math.abs(clickY - ty) < 16) {
        return { type: "meeting_room" }
      }
    }
  }

  return { type: "none" }
}
