import type { AgentStatus } from "@ozap-office/shared"
import { CANVAS_CONFIG } from "./isometric"

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#888888",
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

const GRASS_COLORS = ["#5a8c3a", "#4e7d32", "#66994a"]
const GRASS_DARK = ["#4a7a2e", "#3e6d26", "#558840"]

const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

const drawFloorWood = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#c4a882")
  for (let py = 0; py < s; py += 8) {
    rect(ctx, x, y + py, s, 1, "#b89a72")
  }
  rect(ctx, x, y, s, 1, "#cdb892")
  rect(ctx, x, y, 1, s, "#cdb892")
}

const drawFloorTile = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#d4c8a8")
  rect(ctx, x, y, s, 1, "#c4b898")
  rect(ctx, x, y, 1, s, "#c4b898")
  rect(ctx, x + s - 1, y, 1, s, "#baa888")
  rect(ctx, x, y + s - 1, s, 1, "#baa888")
}

const drawFloorCarpet = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#8b4444")
  for (let py = 0; py < s; py += 4) {
    for (let px = 0; px < s; px += 4) {
      if ((px + py) % 8 === 0) {
        rect(ctx, x + px, y + py, 2, 2, "#7a3838")
      }
    }
  }
}

const drawGrass = (ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) => {
  const s = CANVAS_CONFIG.tileSize
  const colorIdx = variant % GRASS_COLORS.length
  rect(ctx, x, y, s, s, GRASS_COLORS[colorIdx])

  const darkColor = GRASS_DARK[colorIdx]
  const seed = (x * 7 + y * 13) % 17
  rect(ctx, x + (seed % 7) * 4, y + (seed % 5) * 6, 2, 3, darkColor)
  rect(ctx, x + ((seed + 3) % 8) * 4, y + ((seed + 7) % 5) * 6, 2, 2, darkColor)
  rect(ctx, x + ((seed + 5) % 7) * 4, y + ((seed + 2) % 6) * 5, 3, 2, darkColor)
}

const drawPath = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#c8b888")
  const seed = (x * 3 + y * 11) % 13
  rect(ctx, x + seed % 6 * 4, y + seed % 4 * 6, 3, 3, "#baa878")
  rect(ctx, x + (seed + 4) % 7 * 4, y + (seed + 2) % 5 * 5, 2, 2, "#b8a070")
}

const drawWallTop = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#8b7355")
  rect(ctx, x, y, s, 4, "#5a4a3a")

  for (let by = 6; by < s; by += 8) {
    const offset = (by % 16 === 6) ? 0 : 8
    for (let bx = offset; bx < s; bx += 16) {
      rect(ctx, x + bx, y + by, 14, 6, "#7a6345")
      rect(ctx, x + bx, y + by, 14, 1, "#8a7355")
    }
  }

  rect(ctx, x, y + s - 2, s, 2, "#6a5a44")
}

const drawWallLeft = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#8b7355")
  rect(ctx, x, y, 4, s, "#5a4a3a")

  for (let by = 0; by < s; by += 8) {
    const offset = (by % 16 === 0) ? 0 : 8
    for (let bx = 6; bx < s; bx += 16) {
      rect(ctx, x + bx, y + by, 6, 6, "#7a6345")
    }
    for (let bx = 6 + offset; bx < s; bx += 16) {
      rect(ctx, x + bx, y + by, 6, 6, "#7a6345")
    }
  }
}

const drawWallRight = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#8b7355")
  rect(ctx, x + s - 4, y, 4, s, "#5a4a3a")

  for (let by = 0; by < s; by += 8) {
    for (let bx = 0; bx < s - 6; bx += 16) {
      rect(ctx, x + bx, y + by, 6, 6, "#7a6345")
    }
  }
}

const drawWallBottom = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#8b7355")
  rect(ctx, x, y + s - 4, s, 4, "#5a4a3a")

  for (let by = 0; by < s - 6; by += 8) {
    const offset = (by % 16 === 0) ? 0 : 8
    for (let bx = offset; bx < s; bx += 16) {
      rect(ctx, x + bx, y + by, 14, 6, "#7a6345")
      rect(ctx, x + bx, y + by + 5, 14, 1, "#6a5335")
    }
  }

  rect(ctx, x, y, s, 2, "#6a5a44")
}

const drawWallCorner = (ctx: CanvasRenderingContext2D, x: number, y: number, corner: string) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#8b7355")

  if (corner === "tl") {
    rect(ctx, x, y, s, 4, "#5a4a3a")
    rect(ctx, x, y, 4, s, "#5a4a3a")
  } else if (corner === "tr") {
    rect(ctx, x, y, s, 4, "#5a4a3a")
    rect(ctx, x + s - 4, y, 4, s, "#5a4a3a")
  } else if (corner === "bl") {
    rect(ctx, x, y + s - 4, s, 4, "#5a4a3a")
    rect(ctx, x, y, 4, s, "#5a4a3a")
  } else if (corner === "br") {
    rect(ctx, x, y + s - 4, s, 4, "#5a4a3a")
    rect(ctx, x + s - 4, y, 4, s, "#5a4a3a")
  }

  rect(ctx, x + 4, y + 4, s - 8, s - 8, "#7a6345")
}

const drawDesk = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#d4c8a8")
  rect(ctx, x, y, s, 1, "#c4b898")
  rect(ctx, x, y, 1, s, "#c4b898")

  rect(ctx, x + 2, y + 4, s - 4, s - 8, "#e8e0d0")
  rect(ctx, x + 2, y + 4, s - 4, 1, "#f0e8d8")
  rect(ctx, x + 2, y + 4, 1, s - 8, "#f0e8d8")
  rect(ctx, x + s - 3, y + 4, 1, s - 8, "#999")
  rect(ctx, x + 2, y + s - 5, s - 4, 1, "#999")

  rect(ctx, x + 4, y + s - 3, 3, 3, "#888")
  rect(ctx, x + s - 7, y + s - 3, 3, 3, "#888")
}

const drawMonitor = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#d4c8a8")
  rect(ctx, x, y, s, 1, "#c4b898")

  rect(ctx, x + 2, y + 4, s - 4, s - 8, "#e8e0d0")
  rect(ctx, x + 2, y + 4, s - 4, 1, "#f0e8d8")
  rect(ctx, x + 2, y + s - 5, s - 4, 1, "#999")

  rect(ctx, x + 6, y + 2, s - 12, s - 14, "#222233")
  rect(ctx, x + 7, y + 3, s - 14, s - 16, "#3a5a8a")
  rect(ctx, x + 7, y + 3, s - 14, 2, "#5a8abb")

  rect(ctx, x + 8, y + 6, 4, 1, "#88bbee")
  rect(ctx, x + 8, y + 8, 6, 1, "#88bbee")
  rect(ctx, x + 8, y + 10, 3, 1, "#88bbee")

  rect(ctx, x + s / 2 - 1, y + s - 10, 2, 3, "#444")
  rect(ctx, x + s / 2 - 3, y + s - 7, 6, 2, "#555")
}

const drawChair = (ctx: CanvasRenderingContext2D, x: number, y: number, room: string | null) => {
  const s = CANVAS_CONFIG.tileSize
  const floorColor = room === "boss_office" ? "#c4a882" : room === "meeting_room" ? "#c4a882" : "#d4c8a8"
  rect(ctx, x, y, s, s, floorColor)
  if (room !== "boss_office" && room !== "meeting_room") {
    rect(ctx, x, y, s, 1, "#c4b898")
    rect(ctx, x, y, 1, s, "#c4b898")
  } else {
    rect(ctx, x, y, s, 1, "#cdb892")
    rect(ctx, x, y, 1, s, "#cdb892")
  }

  rect(ctx, x + 8, y + 6, 16, 18, "#333")
  rect(ctx, x + 9, y + 7, 14, 16, "#444")

  rect(ctx, x + 10, y + 2, 12, 6, "#333")
  rect(ctx, x + 11, y + 3, 10, 4, "#555")

  rect(ctx, x + 10, y + 24, 2, 4, "#222")
  rect(ctx, x + 20, y + 24, 2, 4, "#222")
}

const drawPlant = (ctx: CanvasRenderingContext2D, x: number, y: number, room: string | null) => {
  const s = CANVAS_CONFIG.tileSize
  if (room === "outdoor") {
    rect(ctx, x, y, s, s, "#5a8c3a")
  } else if (room === "boss_office") {
    rect(ctx, x, y, s, s, "#c4a882")
    rect(ctx, x, y, s, 1, "#cdb892")
  } else {
    rect(ctx, x, y, s, s, "#d4c8a8")
    rect(ctx, x, y, s, 1, "#c4b898")
  }

  rect(ctx, x + 10, y + 20, 12, 10, "#8b5e3c")
  rect(ctx, x + 11, y + 21, 10, 8, "#a0704a")

  rect(ctx, x + 14, y + 16, 4, 6, "#3a6a22")

  rect(ctx, x + 8, y + 8, 8, 10, "#4a8a2a")
  rect(ctx, x + 16, y + 6, 8, 10, "#3a7a1e")
  rect(ctx, x + 10, y + 4, 10, 8, "#5a9a32")
  rect(ctx, x + 12, y + 2, 6, 6, "#4a8a2a")
}

const drawBookshelf = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#c4a882")
  rect(ctx, x, y, s, 1, "#cdb892")

  rect(ctx, x + 2, y + 2, s - 4, s - 4, "#6a4a2a")
  rect(ctx, x + 3, y + 3, s - 6, s - 6, "#7a5a3a")

  rect(ctx, x + 3, y + 14, s - 6, 2, "#6a4a2a")

  const bookColors = ["#cc4444", "#4488cc", "#44aa44", "#cc8844", "#8844aa", "#44aaaa"]
  for (let i = 0; i < 5; i++) {
    rect(ctx, x + 4 + i * 5, y + 4, 4, 10, bookColors[i])
    rect(ctx, x + 4 + i * 5, y + 4, 4, 1, bookColors[i + 1] || bookColors[0])
  }

  for (let i = 0; i < 4; i++) {
    rect(ctx, x + 5 + i * 6, y + 17, 4, 10, bookColors[(i + 2) % 6])
    rect(ctx, x + 5 + i * 6, y + 17, 4, 1, bookColors[(i + 3) % 6])
  }
}

const drawWhiteboard = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#c4a882")
  rect(ctx, x, y, s, 1, "#cdb892")

  rect(ctx, x + 2, y + 2, s - 4, s - 6, "#888")
  rect(ctx, x + 3, y + 3, s - 6, s - 8, "#eeeef4")

  rect(ctx, x + 6, y + 6, 10, 2, "#dd4444")
  rect(ctx, x + 6, y + 10, 16, 2, "#4488cc")
  rect(ctx, x + 6, y + 14, 8, 2, "#44aa44")
  rect(ctx, x + 6, y + 18, 14, 2, "#cc8844")

  rect(ctx, x + 4, y + s - 3, 4, 2, "#cc3333")
  rect(ctx, x + 10, y + s - 3, 4, 2, "#3388cc")
  rect(ctx, x + 16, y + s - 3, 4, 2, "#33aa33")
}

const drawRug = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const s = CANVAS_CONFIG.tileSize
  rect(ctx, x, y, s, s, "#8b4444")
  rect(ctx, x + 2, y + 2, s - 4, s - 4, "#9a5050")
  rect(ctx, x + 4, y + 4, s - 8, s - 8, "#8b4444")
  rect(ctx, x + 2, y + 2, s - 4, 1, "#aa6060")
  rect(ctx, x + 2, y + 2, 1, s - 4, "#aa6060")
}

const drawCoffeeMachine = (ctx: CanvasRenderingContext2D, x: number, y: number, room: string | null) => {
  const s = CANVAS_CONFIG.tileSize
  if (room === "hallway") {
    rect(ctx, x, y, s, s, "#d4c8a8")
    rect(ctx, x, y, s, 1, "#c4b898")
  } else {
    rect(ctx, x, y, s, s, "#d4c8a8")
    rect(ctx, x, y, s, 1, "#c4b898")
  }

  rect(ctx, x + 6, y + 8, 20, 22, "#333")
  rect(ctx, x + 7, y + 9, 18, 20, "#444")

  rect(ctx, x + 8, y + 4, 16, 6, "#333")
  rect(ctx, x + 9, y + 5, 14, 4, "#555")

  rect(ctx, x + 9, y + 12, 8, 6, "#222")
  rect(ctx, x + 10, y + 13, 6, 4, "#664422")

  rect(ctx, x + 20, y + 12, 4, 2, "#ff3333")
  rect(ctx, x + 20, y + 16, 4, 2, "#33ff33")
}

export const drawTile = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  type: string,
  room?: string | null,
  variant?: number
) => {
  const drawFunctions: Record<string, () => void> = {
    floor_wood: () => drawFloorWood(ctx, screenX, screenY),
    floor_tile: () => drawFloorTile(ctx, screenX, screenY),
    floor_carpet: () => drawFloorCarpet(ctx, screenX, screenY),
    wall_top: () => drawWallTop(ctx, screenX, screenY),
    wall_left: () => drawWallLeft(ctx, screenX, screenY),
    wall_right: () => drawWallRight(ctx, screenX, screenY),
    wall_bottom: () => drawWallBottom(ctx, screenX, screenY),
    wall_corner_tl: () => drawWallCorner(ctx, screenX, screenY, "tl"),
    wall_corner_tr: () => drawWallCorner(ctx, screenX, screenY, "tr"),
    wall_corner_bl: () => drawWallCorner(ctx, screenX, screenY, "bl"),
    wall_corner_br: () => drawWallCorner(ctx, screenX, screenY, "br"),
    desk: () => drawDesk(ctx, screenX, screenY),
    monitor: () => drawMonitor(ctx, screenX, screenY),
    chair: () => drawChair(ctx, screenX, screenY, room ?? null),
    plant: () => drawPlant(ctx, screenX, screenY, room ?? null),
    bookshelf: () => drawBookshelf(ctx, screenX, screenY),
    whiteboard: () => drawWhiteboard(ctx, screenX, screenY),
    rug: () => drawRug(ctx, screenX, screenY),
    coffee_machine: () => drawCoffeeMachine(ctx, screenX, screenY, room ?? null),
    grass: () => drawGrass(ctx, screenX, screenY, variant ?? 0),
    path: () => drawPath(ctx, screenX, screenY),
  }

  const drawFn = drawFunctions[type]
  if (drawFn) drawFn()
}

const darkenColor = (hex: string, amount: number): string => {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

const lightenColor = (hex: string, amount: number): string => {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount)
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount)
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

const hairStyleForColor = (color: string): "short" | "spiky" | "long" | "curly" | "parted" => {
  const hue = parseInt(color.slice(1, 3), 16)
  if (hue < 50) return "short"
  if (hue < 100) return "spiky"
  if (hue < 150) return "long"
  if (hue < 200) return "curly"
  return "parted"
}

const drawHair = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  headTop: number,
  style: "short" | "spiky" | "long" | "curly" | "parted",
  hairColor: string
) => {
  if (style === "short") {
    rect(ctx, cx - 3, headTop - 2, 14, 5, hairColor)
    rect(ctx, cx - 4, headTop + 1, 3, 3, hairColor)
    rect(ctx, cx + 9, headTop + 1, 3, 3, hairColor)
  } else if (style === "spiky") {
    rect(ctx, cx - 2, headTop, 12, 3, hairColor)
    rect(ctx, cx, headTop - 3, 2, 3, hairColor)
    rect(ctx, cx + 3, headTop - 4, 2, 4, hairColor)
    rect(ctx, cx + 6, headTop - 3, 2, 3, hairColor)
    rect(ctx, cx + 9, headTop - 2, 2, 2, hairColor)
  } else if (style === "long") {
    rect(ctx, cx - 3, headTop - 1, 14, 4, hairColor)
    rect(ctx, cx - 4, headTop + 1, 3, 10, hairColor)
    rect(ctx, cx + 9, headTop + 1, 3, 10, hairColor)
  } else if (style === "curly") {
    rect(ctx, cx - 3, headTop - 1, 14, 4, hairColor)
    rect(ctx, cx - 4, headTop + 1, 2, 4, hairColor)
    rect(ctx, cx + 10, headTop + 1, 2, 4, hairColor)
    rect(ctx, cx, headTop - 3, 3, 2, hairColor)
    rect(ctx, cx + 5, headTop - 3, 3, 2, hairColor)
  } else {
    rect(ctx, cx - 3, headTop - 1, 14, 4, hairColor)
    rect(ctx, cx + 3, headTop - 2, 1, 2, hairColor)
    rect(ctx, cx - 4, headTop + 1, 3, 5, hairColor)
    rect(ctx, cx + 9, headTop + 1, 3, 5, hairColor)
  }
}

const drawCharacterBody = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
) => {
  const W = 20
  const H = 28
  const cx = x + (CANVAS_CONFIG.tileSize - W) / 2
  const cy = y + CANVAS_CONFIG.tileSize - H - 2

  const glowColor = color + "33"
  ctx.fillStyle = glowColor
  ctx.fillRect(Math.round(cx - 2), Math.round(cy - 2), W + 4, H + 4)

  rect(ctx, cx + 2, cy + H, W - 4, 4, "#00000033")
  rect(ctx, cx + 1, cy + H + 2, W - 2, 2, "#00000022")

  const headW = 10
  const headH = 10
  const headX = cx + (W - headW) / 2
  const headTop = cy + 2

  const skinColor = "#f0c8a0"
  const hairColor = darkenColor(color, 20)
  const hairStyle = hairStyleForColor(color)

  drawHair(ctx, headX, headTop, hairStyle, hairColor)

  rect(ctx, headX, headTop + 2, headW, headH, skinColor)
  rect(ctx, headX, headTop + 2, headW, 1, lightenColor(skinColor, 15))
  rect(ctx, headX, headTop + 2, 1, headH, lightenColor(skinColor, 10))

  rect(ctx, headX + 2, headTop + 4, 2, 2, "#ffffff")
  rect(ctx, headX + 6, headTop + 4, 2, 2, "#ffffff")
  rect(ctx, headX + 2, headTop + 4, 1, 1, "#222222")
  rect(ctx, headX + 6, headTop + 4, 1, 1, "#222222")

  rect(ctx, headX + 3, headTop + 8, 1, 1, "#cc8866")
  rect(ctx, headX + 4, headTop + 8, 2, 1, "#cc8866")
  rect(ctx, headX + 6, headTop + 8, 1, 1, "#cc8866")

  const torsoTop = headTop + headH + 1
  const torsoH = 10
  const shoulderW = W

  rect(ctx, cx, torsoTop, shoulderW, torsoH, color)

  const chestColor = lightenColor(color, 40)
  rect(ctx, cx + 3, torsoTop + 1, shoulderW - 6, torsoH - 3, chestColor)

  const armColor = darkenColor(color, 20)
  rect(ctx, cx, torsoTop + 1, 3, torsoH - 2, armColor)
  rect(ctx, cx + shoulderW - 3, torsoTop + 1, 3, torsoH - 2, armColor)

  const legTop = torsoTop + torsoH
  const legH = 7
  rect(ctx, cx + 2, legTop, 6, legH, "#333355")
  rect(ctx, cx + 12, legTop, 6, legH, "#333355")

  rect(ctx, cx + 1, legTop + legH - 1, 7, 3, "#222")
  rect(ctx, cx + 11, legTop + legH - 1, 7, 3, "#222")
}

const drawStatusBubble = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  status: AgentStatus
) => {
  const W = 20
  const cx = x + (CANVAS_CONFIG.tileSize - W) / 2
  const bubbleW = 20
  const bubbleH = 14
  const bubbleX = cx + W - 2
  const bubbleY = y + 2

  const color = STATUS_COLORS[status]
  const label = STATUS_LABELS[status]

  rect(ctx, bubbleX - 1, bubbleY - 1, bubbleW + 2, bubbleH + 2, "#00000066")
  rect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, "#1a1a2e")
  rect(ctx, bubbleX, bubbleY, bubbleW, 1, "#ffffff22")

  rect(ctx, bubbleX + 1, bubbleY + bubbleH, 3, 3, "#1a1a2e")
  rect(ctx, bubbleX + 2, bubbleY + bubbleH + 2, 2, 2, "#00000066")

  ctx.fillStyle = color
  ctx.font = "bold 9px monospace"
  ctx.textAlign = "center"
  ctx.fillText(label, bubbleX + bubbleW / 2, bubbleY + bubbleH - 3)
}

const drawNameLabel = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  status: AgentStatus,
  color: string
) => {
  const W = 20
  const H = 28
  const cx = x + (CANVAS_CONFIG.tileSize - W) / 2
  const cy = y + CANVAS_CONFIG.tileSize - H - 2
  const labelY = cy + H + 6

  const textWidth = name.length * 6 + 16
  const labelX = cx + W / 2 - textWidth / 2

  rect(ctx, labelX - 1, labelY - 1, textWidth + 2, 13, "#00000055")
  rect(ctx, labelX, labelY, textWidth, 11, "#ffffffee")
  rect(ctx, labelX, labelY, textWidth, 1, "#ffffff")

  const dotColor = STATUS_COLORS[status]
  rect(ctx, labelX + 3, labelY + 3, 5, 5, dotColor)
  rect(ctx, labelX + 4, labelY + 4, 3, 3, lightenColor(dotColor, 20))

  ctx.fillStyle = "#111111"
  ctx.font = "bold 8px monospace"
  ctx.textAlign = "left"
  ctx.fillText(name, labelX + 11, labelY + 9)
}

const drawSeatedCharacter = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  room: string | null
) => {
  const s = CANVAS_CONFIG.tileSize
  const floorColor = room === "boss_office" ? "#c4a882" : "#d4c8a8"
  const floorEdge = room === "boss_office" ? "#cdb892" : "#c4b898"
  rect(ctx, x, y, s, s, floorColor)
  rect(ctx, x, y, s, 1, floorEdge)
  rect(ctx, x, y, 1, s, floorEdge)

  rect(ctx, x + 8, y + 16, 16, 14, "#333")
  rect(ctx, x + 9, y + 17, 14, 12, "#444")

  rect(ctx, x + 10, y + 28, 2, 3, "#222")
  rect(ctx, x + 20, y + 28, 2, 3, "#222")

  const W = 18
  const cx = x + (s - W) / 2
  const hairColor = darkenColor(color, 20)
  const hairStyle = hairStyleForColor(color)

  const headW = 12
  const headH = 10
  const headX = cx + (W - headW) / 2
  const headTop = y + 4

  rect(ctx, headX, headTop, headW, headH, hairColor)
  rect(ctx, headX + 1, headTop + 1, headW - 2, headH - 2, darkenColor(hairColor, 10))

  if (hairStyle === "spiky") {
    rect(ctx, headX + 1, headTop - 3, 2, 3, hairColor)
    rect(ctx, headX + 4, headTop - 4, 2, 4, hairColor)
    rect(ctx, headX + 7, headTop - 3, 2, 3, hairColor)
    rect(ctx, headX + 10, headTop - 2, 2, 2, hairColor)
  } else if (hairStyle === "long") {
    rect(ctx, headX - 1, headTop, 2, headH + 2, hairColor)
    rect(ctx, headX + headW - 1, headTop, 2, headH + 2, hairColor)
    rect(ctx, headX, headTop - 1, headW, 2, hairColor)
  } else if (hairStyle === "curly") {
    rect(ctx, headX + 1, headTop - 2, 3, 2, hairColor)
    rect(ctx, headX + 5, headTop - 3, 3, 3, hairColor)
    rect(ctx, headX + 9, headTop - 2, 3, 2, hairColor)
  } else if (hairStyle === "parted") {
    rect(ctx, headX + headW / 2 - 1, headTop - 1, 2, 1, darkenColor(hairColor, 30))
    rect(ctx, headX - 1, headTop + 1, 2, 4, hairColor)
    rect(ctx, headX + headW - 1, headTop + 1, 2, 4, hairColor)
  }

  const skinColor = "#e8c098"
  rect(ctx, headX + 1, headTop + headH - 2, headW - 2, 2, skinColor)

  const earColor = "#e0b888"
  rect(ctx, headX - 1, headTop + 3, 2, 3, earColor)
  rect(ctx, headX + headW - 1, headTop + 3, 2, 3, earColor)

  const torsoTop = headTop + headH + 1
  rect(ctx, cx + 1, torsoTop, W - 2, 8, color)
  rect(ctx, cx + 2, torsoTop + 1, W - 4, 6, darkenColor(color, 15))

  rect(ctx, cx + W / 2 - 1, torsoTop, 2, 8, darkenColor(color, 25))

  const armColor = darkenColor(color, 20)
  rect(ctx, cx, torsoTop, 3, 4, armColor)
  rect(ctx, cx + W - 3, torsoTop, 3, 4, armColor)
  rect(ctx, cx - 1, torsoTop - 4, 3, 5, armColor)
  rect(ctx, cx + W - 2, torsoTop - 4, 3, 5, armColor)

  rect(ctx, cx - 1, torsoTop - 5, 3, 2, skinColor)
  rect(ctx, cx + W - 2, torsoTop - 5, 3, 2, skinColor)

  rect(ctx, cx + 10, y + 8, 12, 8, "#333")
  rect(ctx, cx + 11, y + 9, 10, 6, "#555")

  rect(ctx, cx + 3, torsoTop + 8, 5, 4, "#333355")
  rect(ctx, cx + W - 8, torsoTop + 8, 5, 4, "#333355")
  rect(ctx, cx + 2, torsoTop + 11, 6, 2, "#222")
  rect(ctx, cx + W - 8, torsoTop + 11, 6, 2, "#222")
}

export const drawAgent = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  color: string,
  name: string,
  status: AgentStatus,
  seated: boolean = false,
  room: string | null = null
) => {
  if (seated) {
    drawSeatedCharacter(ctx, screenX, screenY, color, room)
  } else {
    drawCharacterBody(ctx, screenX, screenY, color)
  }
  drawStatusBubble(ctx, screenX, screenY, status)
  drawNameLabel(ctx, screenX, screenY, name, status, color)
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

  rect(ctx, labelX - 1, labelY - 1, textWidth + 2, 14, "#5a4a3a")
  rect(ctx, labelX, labelY, textWidth, 12, "#f0e8d8")

  ctx.fillStyle = "#5a4a3a"
  ctx.font = "bold 8px monospace"
  ctx.textAlign = "center"
  ctx.fillText(text, labelX + textWidth / 2, labelY + 9)
}
