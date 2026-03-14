export type TileType = "floor" | "wall" | "door" | "desk" | "chair" | "monitor" | "whiteboard" | "empty"

export type RoomType = "boss_office" | "meeting_room" | "open_office"

export type Tile = {
  type: TileType
  room: RoomType | null
  walkable: boolean
}

const GRID_WIDTH = 15
const GRID_HEIGHT = 10

const createTile = (type: TileType, room: RoomType | null = null, walkable = true): Tile => ({
  type,
  room,
  walkable: type !== "wall" && type !== "empty" && walkable,
})

export const createOfficeMap = (): Tile[][] => {
  const map: Tile[][] = Array.from({ length: GRID_HEIGHT }, () =>
    Array.from({ length: GRID_WIDTH }, () => createTile("empty", null, false))
  )

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 5; x++) {
      const isWall = y === 0 || x === 0 || (x === 4 && y < 3)
      map[y][x] = isWall
        ? createTile("wall", "boss_office", false)
        : createTile("floor", "boss_office")
    }
  }
  map[3][4] = createTile("door", "boss_office")
  map[2][2] = createTile("desk", "boss_office")

  for (let y = 5; y < 10; y++) {
    for (let x = 0; x < 5; x++) {
      const isWall = y === 9 || x === 0 || (x === 4 && y > 5)
      map[y][x] = isWall
        ? createTile("wall", "meeting_room", false)
        : createTile("floor", "meeting_room")
    }
  }
  map[5][4] = createTile("door", "meeting_room")
  map[7][2] = createTile("whiteboard", "meeting_room")

  for (let y = 0; y < 10; y++) {
    for (let x = 5; x < 15; x++) {
      const isWall = y === 0 || y === 9 || x === 14
      map[y][x] = isWall
        ? createTile("wall", "open_office", false)
        : createTile("floor", "open_office")
    }
  }

  map[2][7] = createTile("desk", "open_office")
  map[2][11] = createTile("desk", "open_office")
  map[5][7] = createTile("desk", "open_office")
  map[5][11] = createTile("desk", "open_office")
  map[7][9] = createTile("desk", "open_office")

  return map
}

export const OFFICE_MAP = createOfficeMap()
export const GRID = { width: GRID_WIDTH, height: GRID_HEIGHT }
