import type { TileRect } from '@shared/types'

export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

function centered(area: WorkArea, cols: number, rows: number, width: number, height: number, count: number): TileRect[] {
  const originX = area.x + Math.floor((area.width - cols * width) / 2)
  const originY = area.y + Math.floor((area.height - rows * height) / 2)
  const tiles: TileRect[] = []
  for (let i = 0; i < count; i++) {
    tiles.push({ x: originX + (i % cols) * width, y: originY + Math.floor(i / cols) * height, width, height })
  }
  return tiles
}

export function computeTiles(count: number, area: WorkArea, fixedWidth: number, fixedHeight: number): TileRect[] {
  if (count <= 0) return []

  const naturalCols = Math.max(1, Math.floor(area.width / fixedWidth))
  const naturalRows = Math.max(1, Math.floor(area.height / fixedHeight))
  if (count <= naturalCols * naturalRows) {
    let pick = { cols: naturalCols, rows: Math.ceil(count / naturalCols), empty: Number.POSITIVE_INFINITY }
    for (let cols = 1; cols <= Math.min(count, naturalCols); cols++) {
      const rows = Math.ceil(count / cols)
      if (rows > naturalRows) continue
      const empty = cols * rows - count
      if (rows < pick.rows || (rows === pick.rows && empty < pick.empty)) pick = { cols, rows, empty }
    }
    return centered(area, pick.cols, pick.rows, fixedWidth, fixedHeight, count)
  }

  let best = { cols: 1, scale: -1 }
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const scale = Math.min(area.width / cols / fixedWidth, area.height / rows / fixedHeight, 1)
    if (scale > best.scale) best = { cols, scale }
  }
  const width = Math.max(320, Math.floor(fixedWidth * best.scale))
  const height = Math.max(240, Math.floor(fixedHeight * best.scale))
  return centered(area, best.cols, Math.ceil(count / best.cols), width, height, count)
}
