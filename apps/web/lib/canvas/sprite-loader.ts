type SpriteData = string[][]

type CharacterSprites = {
  walk: Record<Direction, SpriteData[]>
  typing: Record<Direction, SpriteData[]>
  reading: Record<Direction, SpriteData[]>
}

type Direction = "down" | "up" | "right" | "left"

type BubbleType = "working" | "done" | "waiting" | "error"

type FurnitureManifest = {
  id: string
  name: string
  type: "asset" | "group"
  groupType?: "rotation" | "state" | "animation"
  width?: number
  height?: number
  footprintW?: number
  footprintH?: number
  file?: string
  state?: string
  orientation?: string
  members?: FurnitureManifest[]
}

type FurnitureSprites = Record<string, {
  manifest: FurnitureManifest
  sprites: Record<string, SpriteData>
}>

type AssetBundle = {
  characters: (CharacterSprites | undefined)[]
  floors: SpriteData[]
  wallTileset: SpriteData[]
  furniture: FurnitureSprites
  bubbles: Record<BubbleType, SpriteData>
}

const CHAR_FRAME_W = 16
const CHAR_FRAME_H = 32
const CHAR_PALETTE_COUNT = 6
const FLOOR_COUNT = 9
const WALL_PIECE_W = 16
const WALL_PIECE_H = 32

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load: ${src}`))
    img.src = src
  })

const imageToSpriteData = (img: HTMLImageElement): SpriteData => {
  const canvas = document.createElement("canvas")
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, img.width, img.height)

  const rows: SpriteData = []
  for (let y = 0; y < img.height; y++) {
    const row: string[] = []
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      const a = data[i + 3]
      if (a < 2) {
        row.push("")
      } else {
        const r = data[i].toString(16).padStart(2, "0")
        const g = data[i + 1].toString(16).padStart(2, "0")
        const b = data[i + 2].toString(16).padStart(2, "0")
        row.push(`#${r}${g}${b}`)
      }
    }
    rows.push(row)
  }
  return rows
}

const extractRegion = (sprite: SpriteData, x: number, y: number, w: number, h: number): SpriteData =>
  sprite.slice(y, y + h).map((row) => row.slice(x, x + w))

const mirrorHorizontal = (sprite: SpriteData): SpriteData =>
  sprite.map((row) => [...row].reverse())

const parseCharacterSheet = (sheet: SpriteData): CharacterSprites => {
  const directionRows: Direction[] = ["down", "up", "right"]
  const walkIndices = [0, 1, 2]
  const typingIndices = [3, 4]
  const readingIndices = [5, 6]

  const extractFrames = (dir: number, indices: number[]): SpriteData[] =>
    indices.map((i) =>
      extractRegion(sheet, i * CHAR_FRAME_W, dir * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H)
    )

  const walk: Record<Direction, SpriteData[]> = { down: [], up: [], right: [], left: [] }
  const typing: Record<Direction, SpriteData[]> = { down: [], up: [], right: [], left: [] }
  const reading: Record<Direction, SpriteData[]> = { down: [], up: [], right: [], left: [] }

  for (let d = 0; d < 3; d++) {
    const dir = directionRows[d]
    walk[dir] = extractFrames(d, walkIndices)
    typing[dir] = extractFrames(d, typingIndices)
    reading[dir] = extractFrames(d, readingIndices)
  }

  walk.left = walk.right.map(mirrorHorizontal)
  typing.left = typing.right.map(mirrorHorizontal)
  reading.left = reading.right.map(mirrorHorizontal)

  return { walk, typing, reading }
}

const parseWallTileset = (sheet: SpriteData): SpriteData[] => {
  const pieces: SpriteData[] = []
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      pieces.push(
        extractRegion(sheet, col * WALL_PIECE_W, row * WALL_PIECE_H, WALL_PIECE_W, WALL_PIECE_H)
      )
    }
  }
  return pieces
}

type BubbleJson = {
  palette: Record<string, string>
  pixels: string[][]
}

const loadBubble = async (type: BubbleType): Promise<SpriteData> => {
  const response = await fetch(`/assets/bubbles/bubble-${type}.json`)
  const json: BubbleJson = await response.json()
  return json.pixels.map((row) =>
    row.map((key) => json.palette[key] ?? "")
  )
}

const loadFurnitureItem = async (name: string): Promise<{ manifest: FurnitureManifest; sprites: Record<string, SpriteData> }> => {
  const basePath = `/assets/furniture/${name}`
  const manifestRes = await fetch(`${basePath}/manifest.json`)
  const manifest: FurnitureManifest = await manifestRes.json()

  const sprites: Record<string, SpriteData> = {}

  const collectAssets = async (node: FurnitureManifest) => {
    if (node.type === "asset") {
      const filename = node.file ?? `${node.id}.png`
      try {
        const img = await loadImage(`${basePath}/${filename}`)
        sprites[node.id] = imageToSpriteData(img)
      } catch {
        console.warn(`Missing furniture sprite: ${basePath}/${filename}`)
      }
    }
    if (node.members) {
      await Promise.all(node.members.map(collectAssets))
    }
  }

  await collectAssets(manifest)
  return { manifest, sprites }
}

const hexToRgb = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

const hslToHex = (h: number, s: number, l: number): string => {
  const hNorm = ((h % 360) + 360) % 360
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + hNorm / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(Math.max(0, Math.min(255, color * 255)))
      .toString(16)
      .padStart(2, "0")
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export const adjustSpriteHue = (sprite: SpriteData, hueShiftDeg: number): SpriteData =>
  sprite.map((row) =>
    row.map((pixel) => {
      if (!pixel) return ""
      const [r, g, b] = hexToRgb(pixel)
      const [h, s, l] = rgbToHsl(r, g, b)
      return hslToHex(h + hueShiftDeg, s, l)
    })
  )

const adjustCharacterSpritesHue = (sprites: CharacterSprites, hueShiftDeg: number): CharacterSprites => {
  const adjustDir = (dirMap: Record<Direction, SpriteData[]>): Record<Direction, SpriteData[]> => {
    const result: Record<Direction, SpriteData[]> = { down: [], up: [], right: [], left: [] }
    for (const dir of ["down", "up", "right", "left"] as Direction[]) {
      result[dir] = dirMap[dir].map((frame) => adjustSpriteHue(frame, hueShiftDeg))
    }
    return result
  }
  return {
    walk: adjustDir(sprites.walk),
    typing: adjustDir(sprites.typing),
    reading: adjustDir(sprites.reading),
  }
}

const FURNITURE_ITEMS = [
  "BIN", "BOOKSHELF", "CACTUS", "CLOCK", "COFFEE", "COFFEE_TABLE",
  "CUSHIONED_BENCH", "CUSHIONED_CHAIR", "DESK", "DOUBLE_BOOKSHELF",
  "HANGING_PLANT", "LARGE_PAINTING", "LARGE_PLANT", "PC", "PLANT",
  "PLANT_2", "POT", "SMALL_PAINTING", "SMALL_PAINTING_2", "SMALL_TABLE",
  "SOFA", "TABLE_FRONT", "WHITEBOARD", "WOODEN_BENCH", "WOODEN_CHAIR",
]

export const loadAllAssets = async (): Promise<AssetBundle> => {
  const characterPromises = Array.from({ length: CHAR_PALETTE_COUNT }, (_, i) =>
    loadImage(`/assets/characters/char_${i}.png`)
      .then(imageToSpriteData)
      .then(parseCharacterSheet)
      .catch(() => {
        console.warn(`Failed to load char_${i}.png`)
        return undefined
      })
  )

  const floorPromises = Array.from({ length: FLOOR_COUNT }, (_, i) =>
    loadImage(`/assets/floors/floor_${i}.png`)
      .then(imageToSpriteData)
      .catch(() => {
        console.warn(`Failed to load floor_${i}.png`)
        return null
      })
  )

  const wallPromise = loadImage("/assets/walls/wall_0.png")
    .then(imageToSpriteData)
    .then(parseWallTileset)
    .catch(() => {
      console.warn("Failed to load wall_0.png")
      return [] as SpriteData[]
    })

  const bubbleTypes: BubbleType[] = ["working", "done", "waiting", "error"]
  const bubblePromises = bubbleTypes.map((type) =>
    loadBubble(type).catch(() => {
      console.warn(`Failed to load bubble-${type}.json`)
      return [] as SpriteData
    })
  )

  const furniturePromises = FURNITURE_ITEMS.map((name) =>
    loadFurnitureItem(name).catch(() => {
      console.warn(`Failed to load furniture: ${name}`)
      return null
    })
  )

  const [charResults, floorResults, wallTileset, bubbleResults, furnitureResults] = await Promise.all([
    Promise.all(characterPromises),
    Promise.all(floorPromises),
    wallPromise,
    Promise.all(bubblePromises),
    Promise.all(furniturePromises),
  ])

  const characters = charResults as (CharacterSprites | undefined)[]
  const floors = floorResults.filter((f): f is SpriteData => f !== null)

  const bubbles = {} as Record<BubbleType, SpriteData>
  bubbleTypes.forEach((type, i) => {
    bubbles[type] = bubbleResults[i]
  })

  const furniture: FurnitureSprites = {}
  for (const result of furnitureResults) {
    if (result) furniture[result.manifest.id] = result
  }

  return { characters, floors, wallTileset, furniture, bubbles }
}

export type { SpriteData, CharacterSprites, AssetBundle, Direction, BubbleType, FurnitureSprites, FurnitureManifest }
export { adjustCharacterSpritesHue, hexToRgb, rgbToHsl, hslToHex }
