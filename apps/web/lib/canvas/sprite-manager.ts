import type { AgentStatus } from "@ozap-office/shared"

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#666666",
  working: "#50fa7b",
  thinking: "#f1fa8c",
  waiting: "#ffb86c",
  meeting: "#bd93f9",
  error: "#ff5555",
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: "zzz",
  working: "...",
  thinking: "?",
  waiting: "!",
  meeting: ">>",
  error: "X",
}

export const drawAgent = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  color: string,
  name: string,
  status: AgentStatus
) => {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(screenX, screenY - 16, 12, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = STATUS_COLORS[status]
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(screenX, screenY - 16, 15, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = "#ffffff"
  ctx.font = "10px monospace"
  ctx.textAlign = "center"
  ctx.fillText(name, screenX, screenY + 6)

  ctx.fillStyle = STATUS_COLORS[status]
  ctx.font = "bold 10px monospace"
  ctx.fillText(STATUS_LABELS[status], screenX + 16, screenY - 28)
}

export const drawTile = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  type: string,
  tileWidth: number,
  tileHeight: number
) => {
  const halfW = tileWidth / 2
  const halfH = tileHeight / 2

  ctx.beginPath()
  ctx.moveTo(screenX, screenY - halfH)
  ctx.lineTo(screenX + halfW, screenY)
  ctx.lineTo(screenX, screenY + halfH)
  ctx.lineTo(screenX - halfW, screenY)
  ctx.closePath()

  const tileColors: Record<string, string> = {
    floor: "#2a2a3e",
    wall: "#1a1a2e",
    door: "#3a3a5e",
    desk: "#4a3a2e",
    chair: "#3a3a3e",
    monitor: "#2a4a6e",
    whiteboard: "#5a5a7e",
    empty: "transparent",
  }

  ctx.fillStyle = tileColors[type] ?? "#2a2a3e"
  ctx.fill()
  ctx.strokeStyle = "#ffffff10"
  ctx.lineWidth = 1
  ctx.stroke()
}
