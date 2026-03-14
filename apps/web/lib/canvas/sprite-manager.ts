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

const ROOM_FLOOR_COLORS: Record<string, string> = {
  boss_office: "#1e1e32",
  meeting_room: "#1a2236",
  open_office: "#222236",
}

const drawIsoDiamond = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  color: string
) => {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - halfH)
  ctx.lineTo(x + halfW, y)
  ctx.lineTo(x, y + halfH)
  ctx.lineTo(x - halfW, y)
  ctx.closePath()
  ctx.fill()
}

const drawIsoBox = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  height: number,
  topColor: string,
  leftColor: string,
  rightColor: string
) => {
  ctx.fillStyle = leftColor
  ctx.beginPath()
  ctx.moveTo(x - halfW, y)
  ctx.lineTo(x, y + halfH)
  ctx.lineTo(x, y + halfH + height)
  ctx.lineTo(x - halfW, y + height)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = rightColor
  ctx.beginPath()
  ctx.moveTo(x + halfW, y)
  ctx.lineTo(x, y + halfH)
  ctx.lineTo(x, y + halfH + height)
  ctx.lineTo(x + halfW, y + height)
  ctx.closePath()
  ctx.fill()

  drawIsoDiamond(ctx, x, y, halfW, halfH, topColor)
}

export const drawTile = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  type: string,
  tileWidth: number,
  tileHeight: number,
  room?: string | null
) => {
  const halfW = tileWidth / 2
  const halfH = tileHeight / 2

  if (type === "empty") return

  if (type === "wall") {
    drawIsoBox(ctx, screenX, screenY - 20, halfW, halfH, 20, "#3a3a5e", "#2a2a4e", "#1e1e3e")
    return
  }

  const floorColor = room ? (ROOM_FLOOR_COLORS[room] ?? "#2a2a3e") : "#2a2a3e"
  drawIsoDiamond(ctx, screenX, screenY, halfW, halfH, floorColor)

  ctx.strokeStyle = "#ffffff08"
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(screenX, screenY - halfH)
  ctx.lineTo(screenX + halfW, screenY)
  ctx.lineTo(screenX, screenY + halfH)
  ctx.lineTo(screenX - halfW, screenY)
  ctx.closePath()
  ctx.stroke()

  if (type === "desk") {
    drawIsoBox(ctx, screenX, screenY - 8, halfW * 0.6, halfH * 0.6, 8, "#5a4a3a", "#4a3a2a", "#3a2a1a")
    drawIsoBox(ctx, screenX - 4, screenY - 14, 4, 3, 4, "#333355", "#2a2a44", "#222238")
    ctx.fillStyle = "#4a9eff33"
    ctx.fillRect(screenX - 7, screenY - 18, 6, 3)
  }

  if (type === "whiteboard") {
    drawIsoBox(ctx, screenX, screenY - 24, halfW * 0.7, halfH * 0.3, 24, "#aaaacc", "#888aaa", "#666688")
  }

  if (type === "door") {
    drawIsoDiamond(ctx, screenX, screenY, halfW, halfH, "#3a3a5e")
    ctx.strokeStyle = "#50fa7b44"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(screenX, screenY - halfH)
    ctx.lineTo(screenX + halfW, screenY)
    ctx.lineTo(screenX, screenY + halfH)
    ctx.lineTo(screenX - halfW, screenY)
    ctx.closePath()
    ctx.stroke()
  }
}

const drawCharacterBody = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
) => {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y - 24, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = "#ddccbb"
  ctx.beginPath()
  ctx.arc(x, y - 24, 4, Math.PI, 0)
  ctx.fill()

  ctx.fillStyle = color
  ctx.fillRect(x - 5, y - 18, 10, 10)

  ctx.fillStyle = "#222222"
  ctx.fillRect(x - 4, y - 8, 3, 6)
  ctx.fillRect(x + 1, y - 8, 3, 6)

  ctx.fillStyle = "#ffffff22"
  ctx.fillRect(x - 3, y - 16, 6, 4)
}

const drawStatusBubble = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  status: AgentStatus
) => {
  const bubbleY = y - 38
  const color = STATUS_COLORS[status]
  const label = STATUS_LABELS[status]

  ctx.fillStyle = "#00000088"
  ctx.beginPath()
  ctx.roundRect(x - 10, bubbleY - 8, 20, 14, 4)
  ctx.fill()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x - 9, bubbleY - 7, 18, 12, 3)
  ctx.fill()

  ctx.fillStyle = "#000000"
  ctx.font = "bold 8px monospace"
  ctx.textAlign = "center"
  ctx.fillText(label, x, bubbleY + 2)
}

export const drawAgent = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  color: string,
  name: string,
  status: AgentStatus
) => {
  drawCharacterBody(ctx, screenX, screenY, color)
  drawStatusBubble(ctx, screenX, screenY, status)

  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 9px monospace"
  ctx.textAlign = "center"
  ctx.fillText(name, screenX, screenY + 8)

  ctx.strokeStyle = STATUS_COLORS[status]
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(screenX, screenY - 24, 8, 0, Math.PI * 2)
  ctx.stroke()
}
