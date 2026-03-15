import type { SpriteData } from "./sprite-loader"

type ColorConfig = {
  h: number
  s: number
  b: number
  c: number
}

const hexToRgb = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

const hslToHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(Math.max(0, Math.min(255, color * 255)))
      .toString(16)
      .padStart(2, "0")
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const perceivedLuminance = (r: number, g: number, b: number): number =>
  0.299 * r + 0.587 * g + 0.114 * b

export const colorizeSprite = (sprite: SpriteData, config: ColorConfig): SpriteData =>
  sprite.map((row) =>
    row.map((pixel) => {
      if (!pixel) return ""
      const [r, g, b] = hexToRgb(pixel)
      let lum = perceivedLuminance(r, g, b)

      if (config.c !== 0) {
        lum = (lum - 0.5) * (1 + config.c) + 0.5
      }
      lum = Math.max(0, Math.min(1, lum + config.b))

      return hslToHex(config.h, config.s, lum)
    })
  )

export const ROOM_FLOOR_COLORS: Record<string, { floorIndex: number; color: ColorConfig }> = {
  boss_office: { floorIndex: 0, color: { h: 30, s: 0.4, b: 0.1, c: 0.2 } },
  open_office: { floorIndex: 2, color: { h: 200, s: 0.1, b: 0.0, c: 0.0 } },
  meeting_room: { floorIndex: 4, color: { h: 220, s: 0.3, b: -0.1, c: 0.1 } },
  hallway: { floorIndex: 1, color: { h: 40, s: 0.15, b: 0.1, c: 0.0 } },
  outdoor: { floorIndex: 5, color: { h: 120, s: 0.3, b: -0.1, c: 0.1 } },
}

export const WALL_COLOR: ColorConfig = { h: 30, s: 0.25, b: 0.0, c: 0.1 }

export type { ColorConfig }
