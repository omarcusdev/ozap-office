export type TileType = "floor" | "wall" | "grass" | "path" | "empty"
export type RoomType = "boss_office" | "meeting_room" | "open_office" | "hallway" | "outdoor"
export type Tile = { type: TileType; room: RoomType | null; variant?: number }

export type FurnitureId =
  | "DESK" | "CUSHIONED_CHAIR" | "BOOKSHELF" | "LARGE_PLANT" | "SOFA"
  | "LARGE_PAINTING" | "PC" | "COFFEE" | "HANGING_PLANT" | "CLOCK"
  | "WHITEBOARD" | "TABLE_FRONT" | "SMALL_PAINTING" | "PLANT" | "PLANT_2"

export type FurniturePlacement = {
  id: FurnitureId
  gridX: number
  gridY: number
  orientation?: "front" | "back" | "side" | "side-mirror"
  state?: "on" | "off"
}

const GRID_WIDTH = 30
const GRID_HEIGHT = 20

const t = (type: TileType, room: RoomType | null = null, variant?: number): Tile => ({
  type,
  room,
  ...(variant !== undefined ? { variant } : {}),
})

const G = (v?: number) => t("grass", "outdoor", v)
const P = () => t("path", "outdoor")
const F = (room: RoomType) => t("floor", room)
const W = (room: RoomType) => t("wall", room)
const HW = () => F("hallway")

const b = "boss_office" as const
const m = "meeting_room" as const
const o = "open_office" as const

export const createOfficeMap = (): Tile[][] => [
  //  0        1        2        3        4        5        6        7        8        9        10       11       12       13       14       15       16       17       18       19       20       21       22       23       24       25       26       27       28       29
  [G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G()    ], // row 0
  [G(),     W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    G(1),    P(),     G(),     W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    G()    ], // row 1
  [G(2),    W(b),    F(b),    F(b),    F(b),    F(b),    F(b),    F(b),    W(b),    G(),     P(),     G(2),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G(1)   ], // row 2
  [G(),     W(b),    F(b),    F(b),    F(b),    F(b),    F(b),    F(b),    W(b),    G(),     P(),     G(),     W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G()    ], // row 3
  [G(1),    W(b),    F(b),    F(b),    F(b),    F(b),    F(b),    F(b),    W(b),    G(2),    P(),     G(1),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G()    ], // row 4
  [G(),     W(b),    F(b),    F(b),    F(b),    F(b),    F(b),    F(b),    F(b),    HW(),    HW(),    HW(),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G(2)   ], // row 5
  [G(),     W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    W(b),    HW(),    HW(),    HW(),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G()    ], // row 6
  [G(1),    G(),     G(),     G(),     G(),     G(),     G(1),    G(),     HW(),    HW(),    HW(),    HW(),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G(1)   ], // row 7
  [G(),     G(2),    G(),     G(),     G(),     G(),     G(),     G(),     HW(),    HW(),    HW(),    HW(),    W(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    F(o),    W(o),    G()    ], // row 8
  [G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     HW(),    HW(),    HW(),    HW(),    W(o),    F(o),    F(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    W(o),    G()    ], // row 9
  [G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     P(),     P(),     HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(2)   ], // row 10
  [G(),     G(1),    G(),     G(2),    G(),     G(),     G(1),    G(),     W(m),    W(m),    W(m),    W(m),    W(m),    F(m),    F(m),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G()    ], // row 11
  [G(),     G(),     G(2),    G(),     G(),     G(),     G(),     G(),     W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(),     G(),     G(2),    G(),     G(),     G(),     G(),     G(2),    G()    ], // row 12
  [G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(1),    W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     G(),     G(1)   ], // row 13
  [G(),     G(),     G(1),    G(),     G(),     G(1),    G(),     G(),     W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(1),    G()    ], // row 14
  [G(2),    G(),     G(),     G(),     G(),     G(),     G(2),    G(),     W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G()    ], // row 15
  [G(),     G(1),    G(),     G(2),    G(),     G(),     G(),     G(1),    W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(),     G(1),    G(),     G(),     G(),     G(1),    G(),     G(),     G(2)   ], // row 16
  [G(),     G(),     G(),     G(),     G(1),    G(),     G(2),    G(),     W(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    F(m),    W(m),    G(),     G(),     G(2),    G(),     G(),     G(),     G(),     G(1),    G()    ], // row 17
  [G(1),    G(),     G(2),    G(),     G(),     G(),     G(),     G(1),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    W(m),    G(1),    G(),     G(),     G(1),    G(),     G(2),    G(),     G(),     G()    ], // row 18
  [G(),     G(),     G(),     G(1),    G(),     G(2),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G(1),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(),     G(1)   ], // row 19
]

export const OFFICE_MAP = createOfficeMap()
export const GRID = { width: GRID_WIDTH, height: GRID_HEIGHT }

export const ROOM_LABELS: Array<{ text: string; gridX: number; gridY: number }> = [
  { text: "BOSS OFFICE", gridX: 4, gridY: 1 },
  { text: "OPEN OFFICE", gridX: 20, gridY: 1 },
  { text: "MEETING ROOM", gridX: 13, gridY: 12 },
]

export const OPEN_OFFICE_DESK_POSITIONS: Array<{ gridX: number; gridY: number }> = [
  { gridX: 14, gridY: 4 },
  { gridX: 17, gridY: 4 },
  { gridX: 20, gridY: 4 },
  { gridX: 23, gridY: 4 },
  { gridX: 26, gridY: 4 },
  { gridX: 14, gridY: 7 },
]

type Waypoint = { x: number; y: number }

export const MEETING_ROUTES: Record<string, { path: Waypoint[]; seat: Waypoint }> = {
  Leader: {
    path: [
      { x: 2, y: 4 }, { x: 4, y: 5 }, { x: 8, y: 5 },
      { x: 9, y: 7 }, { x: 10, y: 10 }, { x: 13, y: 11 },
      { x: 14, y: 13 },
    ],
    seat: { x: 14, y: 13 },
  },
  Finance: {
    path: [
      { x: 14, y: 5 }, { x: 13, y: 8 }, { x: 13, y: 10 },
      { x: 13, y: 11 }, { x: 12, y: 14 },
    ],
    seat: { x: 12, y: 14 },
  },
  Ads: {
    path: [
      { x: 17, y: 5 }, { x: 14, y: 8 }, { x: 14, y: 10 },
      { x: 14, y: 11 }, { x: 16, y: 14 },
    ],
    seat: { x: 16, y: 14 },
  },
  Analytics: {
    path: [
      { x: 20, y: 5 }, { x: 16, y: 8 }, { x: 14, y: 10 },
      { x: 13, y: 11 }, { x: 12, y: 16 },
    ],
    seat: { x: 12, y: 16 },
  },
}

export const FURNITURE_PLACEMENTS: FurniturePlacement[] = [
  { id: "DESK", gridX: 3, gridY: 3, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 3, gridY: 4, orientation: "back" },
  { id: "BOOKSHELF", gridX: 6, gridY: 3 },
  { id: "LARGE_PLANT", gridX: 7, gridY: 4 },
  { id: "SOFA", gridX: 2, gridY: 5, orientation: "front" },
  { id: "LARGE_PAINTING", gridX: 4, gridY: 1 },

  { id: "PC", gridX: 14, gridY: 3, state: "off" },
  { id: "PC", gridX: 17, gridY: 3, state: "off" },
  { id: "PC", gridX: 20, gridY: 3, state: "off" },
  { id: "PC", gridX: 23, gridY: 3, state: "off" },
  { id: "PC", gridX: 26, gridY: 3, state: "off" },
  { id: "CUSHIONED_CHAIR", gridX: 14, gridY: 4, orientation: "back" },
  { id: "CUSHIONED_CHAIR", gridX: 17, gridY: 4, orientation: "back" },
  { id: "CUSHIONED_CHAIR", gridX: 20, gridY: 4, orientation: "back" },
  { id: "CUSHIONED_CHAIR", gridX: 23, gridY: 4, orientation: "back" },
  { id: "CUSHIONED_CHAIR", gridX: 26, gridY: 4, orientation: "back" },
  { id: "PC", gridX: 14, gridY: 6, state: "off" },
  { id: "CUSHIONED_CHAIR", gridX: 14, gridY: 7, orientation: "back" },
  { id: "COFFEE", gridX: 25, gridY: 8 },
  { id: "HANGING_PLANT", gridX: 18, gridY: 1 },
  { id: "CLOCK", gridX: 22, gridY: 1 },

  { id: "WHITEBOARD", gridX: 9, gridY: 12 },
  { id: "TABLE_FRONT", gridX: 13, gridY: 16 },
  { id: "CUSHIONED_CHAIR", gridX: 13, gridY: 13, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 14, gridY: 13, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 15, gridY: 13, orientation: "front" },
  { id: "CUSHIONED_CHAIR", gridX: 12, gridY: 14, orientation: "side" },
  { id: "CUSHIONED_CHAIR", gridX: 16, gridY: 14, orientation: "side-mirror" },
  { id: "CUSHIONED_CHAIR", gridX: 12, gridY: 15, orientation: "side" },
  { id: "CUSHIONED_CHAIR", gridX: 16, gridY: 15, orientation: "side-mirror" },
  { id: "CUSHIONED_CHAIR", gridX: 12, gridY: 16, orientation: "side" },
  { id: "CUSHIONED_CHAIR", gridX: 16, gridY: 16, orientation: "side-mirror" },
  { id: "CUSHIONED_CHAIR", gridX: 13, gridY: 17, orientation: "back" },
  { id: "CUSHIONED_CHAIR", gridX: 14, gridY: 17, orientation: "back" },
  { id: "CUSHIONED_CHAIR", gridX: 15, gridY: 17, orientation: "back" },
  { id: "SMALL_PAINTING", gridX: 14, gridY: 11 },
  { id: "LARGE_PLANT", gridX: 19, gridY: 12 },

  { id: "COFFEE", gridX: 7, gridY: 7 },

  { id: "PLANT", gridX: 3, gridY: 7 },
  { id: "PLANT_2", gridX: 12, gridY: 18 },
]

const computeWallBitmaskGrid = (grid: Tile[][]): number[][] => {
  const height = grid.length
  const width = grid[0].length
  const bitmasks: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 0)
  )

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x].type !== "wall") continue
      const north = y > 0 && grid[y - 1][x].type === "wall" ? 1 : 0
      const east = x < width - 1 && grid[y][x + 1].type === "wall" ? 2 : 0
      const south = y < height - 1 && grid[y + 1][x].type === "wall" ? 4 : 0
      const west = x > 0 && grid[y][x - 1].type === "wall" ? 8 : 0
      bitmasks[y][x] = north | east | south | west
    }
  }

  return bitmasks
}

export const WALL_BITMASKS = computeWallBitmaskGrid(OFFICE_MAP)
