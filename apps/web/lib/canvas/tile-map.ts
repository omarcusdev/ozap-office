export type TileType =
  | "floor_wood"
  | "floor_tile"
  | "floor_carpet"
  | "wall_top"
  | "wall_left"
  | "wall_right"
  | "wall_bottom"
  | "wall_corner_tl"
  | "wall_corner_tr"
  | "wall_corner_bl"
  | "wall_corner_br"
  | "desk"
  | "chair"
  | "monitor"
  | "plant"
  | "bookshelf"
  | "whiteboard"
  | "rug"
  | "coffee_machine"
  | "table"
  | "grass"
  | "path"
  | "empty"

export type RoomType = "boss_office" | "meeting_room" | "open_office" | "hallway" | "outdoor"

export type Tile = {
  type: TileType
  room: RoomType | null
  variant?: number
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
const FW = (room: RoomType) => t("floor_wood", room)
const FT = (room: RoomType) => t("floor_tile", room)
const FC = (room: RoomType) => t("floor_carpet", room)
const WT = (room: RoomType) => t("wall_top", room)
const WL = (room: RoomType) => t("wall_left", room)
const WR = (room: RoomType) => t("wall_right", room)
const WB = (room: RoomType) => t("wall_bottom", room)
const CTL = (room: RoomType) => t("wall_corner_tl", room)
const CTR = (room: RoomType) => t("wall_corner_tr", room)
const CBL = (room: RoomType) => t("wall_corner_bl", room)
const CBR = (room: RoomType) => t("wall_corner_br", room)
const DK = (room: RoomType) => t("desk", room)
const CH = (room: RoomType) => t("chair", room)
const MN = (room: RoomType) => t("monitor", room)
const PL = (room: RoomType) => t("plant", room)
const BS = (room: RoomType) => t("bookshelf", room)
const WH = (room: RoomType) => t("whiteboard", room)
const RG = (room: RoomType) => t("rug", room)
const CF = (room: RoomType) => t("coffee_machine", room)
const TB = (room: RoomType) => t("table", room)
const HW = () => FT("hallway")

const b = "boss_office" as const
const m = "meeting_room" as const
const o = "open_office" as const

// Open office desk positions (gridX, gridY):
// Desk row 1 (row 3): cols 14, 17, 20, 23, 26
// Chair row 1 (row 4): cols 14, 17, 20, 23, 26
// Monitor row 1 (row 3): cols 15, 18, 21, 24, 27

export const createOfficeMap = (): Tile[][] => [
  //  0        1        2        3        4        5        6        7        8        9        10       11       12       13       14       15       16       17       18       19       20       21       22       23       24       25       26       27       28       29
  [G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G()    ], // row 0
  [G(),     CTL(b),  WT(b),   WT(b),   WT(b),   WT(b),   WT(b),   WT(b),   CTR(b),  G(1),    P(),     G(),     CTL(o),  WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   WT(o),   CTR(o),  G()    ], // row 1
  [G(2),    WL(b),   FW(b),   FW(b),   FC(b),   FC(b),   FW(b),   FW(b),   WR(b),   G(),     P(),     G(2),    WL(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   WR(o),   G(1)   ], // row 2
  [G(),     WL(b),   FW(b),   DK(b),   FC(b),   FC(b),   BS(b),   FW(b),   WR(b),   G(),     P(),     G(),     WL(o),   FT(o),   MN(o),   FT(o),   FT(o),   MN(o),   FT(o),   FT(o),   MN(o),   FT(o),   FT(o),   MN(o),   FT(o),   FT(o),   MN(o),   FT(o),   WR(o),   G()    ], // row 3
  [G(1),    WL(b),   FW(b),   CH(b),   FC(b),   FC(b),   FW(b),   PL(b),   WR(b),   G(2),    P(),     G(1),    WL(o),   FT(o),   CH(o),   FT(o),   FT(o),   CH(o),   FT(o),   FT(o),   CH(o),   FT(o),   FT(o),   CH(o),   FT(o),   FT(o),   CH(o),   FT(o),   WR(o),   G()    ], // row 4
  [G(),     WL(b),   RG(b),   RG(b),   RG(b),   FW(b),   FW(b),   FW(b),   FT(b),   HW(),    HW(),    HW(),    WL(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   WR(o),   G(2)   ], // row 5
  [G(),     CBL(b),  WB(b),   WB(b),   WB(b),   WB(b),   WB(b),   WB(b),   CBR(b),  HW(),    HW(),    HW(),    WL(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   WR(o),   G()    ], // row 6
  [G(1),    G(),     G(),     PL("outdoor"),G(),G(),      G(1),    CF("hallway"),HW(),HW(),   HW(),    HW(),    WL(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   WR(o),   G(1)   ], // row 7
  [G(),     G(2),    G(),     G(),     G(),     G(),     G(),     G(),     HW(),    HW(),    HW(),    HW(),    WL(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   FT(o),   CF(o),   FT(o),   FT(o),   WR(o),   G()    ], // row 8
  [G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     HW(),    HW(),    HW(),    HW(),    CBL(o),  FT(o),   FT(o),   WB(o),   WB(o),   WB(o),   WB(o),   WB(o),   WB(o),   WB(o),   WB(o),   WB(o),   WB(o),   WB(o),   WB(o),   WB(o),   CBR(o),  G()    ], // row 9 (door opening at cols 13-14)
  [G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     P(),     P(),     HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    HW(),    G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(2)   ], // row 10 (open office south door at cols 13-14 connects to hallway here)
  [G(),     G(1),    G(),     G(2),    G(),     G(),     G(1),    G(),     P(),     P(),     CTL(m),  WT(m),   WT(m),   FW(m),   FW(m),   WT(m),   WT(m),   CTR(m),  G(2),    G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G()    ], // row 11 (door at cols 13-14)
  [G(),     G(),     G(2),    G(),     G(),     G(),     G(),     G(),     P(),     P(),     WL(m),   WH(m),   FW(m),   CH(m),   CH(m),   CH(m),   FW(m),   WR(m),   G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(),     G(),     G(2),    G()    ], // row 12
  [G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     P(),     WL(m),   FW(m),   CH(m),   TB(m),   TB(m),   TB(m),   CH(m),   WR(m),   G(),     G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     G(),     G(1)   ], // row 13
  [G(),     G(),     G(1),    G(),     G(),     G(1),    G(),     G(),     G(2),    P(),     WL(m),   FW(m),   CH(m),   TB(m),   TB(m),   TB(m),   CH(m),   WR(m),   G(1),    G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(1),    G()    ], // row 14
  [G(2),    G(),     G(),     G(),     G(),     G(),     G(2),    G(),     G(),     P(),     WL(m),   FW(m),   CH(m),   TB(m),   TB(m),   TB(m),   CH(m),   WR(m),   G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G()    ], // row 15
  [G(),     G(1),    G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     P(),     WL(m),   FW(m),   FW(m),   CH(m),   CH(m),   CH(m),   FW(m),   WR(m),   G(),     G(),     G(1),    G(),     G(2),    G(),     G(),     G(),     G(1),    G(),     G(),     G(2)   ], // row 16
  [G(),     G(),     G(),     G(),     G(1),    G(),     G(2),    G(),     G(),     P(),     CBL(m),  WB(m),   WB(m),   WB(m),   WB(m),   WB(m),   WB(m),   CBR(m),  G(1),    G(),     G(),     G(),     G(),     G(2),    G(),     G(),     G(),     G(),     G(1),    G()    ], // row 17
  [G(1),    G(),     G(2),    G(),     G(),     G(),     G(),     G(1),    G(),     G(),     G(2),    G(),     PL("outdoor"),G(),G(1),    G(),     G(),     G(),     G(),     G(1),    G(2),    G(),     G(),     G(),     G(1),    G(),     G(2),    G(),     G(),     G()    ], // row 18
  [G(),     G(),     G(),     G(1),    G(),     G(2),    G(),     G(),     G(2),    G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G(1),    G(),     G(),     G(),     G(1),    G(),     G(),     G(),     G(2),    G(),     G(),     G(),     G(1)   ], // row 19
]

export const OFFICE_MAP = createOfficeMap()
export const GRID = { width: GRID_WIDTH, height: GRID_HEIGHT }

export const ROOM_LABELS: Array<{ text: string; gridX: number; gridY: number }> = [
  { text: "BOSS OFFICE", gridX: 4, gridY: 1 },
  { text: "OPEN OFFICE", gridX: 20, gridY: 1 },
  { text: "MEETING ROOM", gridX: 13, gridY: 11 },
]

export const OPEN_OFFICE_DESK_POSITIONS: Array<{ gridX: number; gridY: number }> = [
  { gridX: 14, gridY: 4 },
  { gridX: 17, gridY: 4 },
  { gridX: 20, gridY: 4 },
  { gridX: 23, gridY: 4 },
  { gridX: 26, gridY: 4 },
]

type Waypoint = { x: number; y: number }

export const MEETING_ROUTES: Record<string, { path: Waypoint[]; seat: Waypoint }> = {
  Leader: {
    path: [
      { x: 2, y: 4 }, { x: 4, y: 5 }, { x: 8, y: 5 },
      { x: 9, y: 7 }, { x: 10, y: 10 }, { x: 13, y: 11 },
      { x: 14, y: 12 },
    ],
    seat: { x: 14, y: 12 },
  },
  Instagram: {
    path: [
      { x: 14, y: 5 }, { x: 13, y: 8 }, { x: 13, y: 10 },
      { x: 12, y: 11 }, { x: 12, y: 13 },
    ],
    seat: { x: 12, y: 13 },
  },
  Sales: {
    path: [
      { x: 17, y: 5 }, { x: 14, y: 8 }, { x: 13, y: 10 },
      { x: 15, y: 11 }, { x: 16, y: 13 },
    ],
    seat: { x: 16, y: 13 },
  },
  Ads: {
    path: [
      { x: 20, y: 5 }, { x: 16, y: 8 }, { x: 13, y: 10 },
      { x: 11, y: 12 }, { x: 12, y: 15 },
    ],
    seat: { x: 12, y: 15 },
  },
  Finance: {
    path: [
      { x: 23, y: 5 }, { x: 18, y: 8 }, { x: 14, y: 10 },
      { x: 16, y: 12 }, { x: 16, y: 15 },
    ],
    seat: { x: 16, y: 15 },
  },
  PM: {
    path: [
      { x: 26, y: 5 }, { x: 20, y: 8 }, { x: 14, y: 10 },
      { x: 14, y: 12 }, { x: 14, y: 16 },
    ],
    seat: { x: 14, y: 16 },
  },
}
