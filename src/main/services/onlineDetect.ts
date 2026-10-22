import { promises as fs } from 'fs'
import { join } from 'path'

export const ONLINE_MARKERS = ['VAC secure mode is activated', 'Using map cycle file']
export const RUN_START = 'Network: IP '

const MAX_SCAN_BYTES = 32 * 1024 * 1024

export interface LogState {
  marker: boolean
  size: number
}

export const consoleLogPath = (serverFolder: string): string => join(serverFolder, 'garrysmod', 'console.log')

export async function logSize(path: string): Promise<number> {
  try {
    return (await fs.stat(path)).size
  } catch {
    return 0
  }
}

const memo = new Map<string, { mtimeMs: number; size: number; marker: boolean }>()

export function hasOnlineMarker(text: string, fromRunStart: boolean): boolean {
  let scope = text
  if (fromRunStart) {
    const index = text.lastIndexOf(RUN_START)
    if (index >= 0) scope = text.slice(index)
  }
  return ONLINE_MARKERS.some((marker) => scope.includes(marker))
}

export async function readLogState(path: string, fromOffset: number | null): Promise<LogState | null> {
  try {
    const stat = await fs.stat(path)
    const start = fromOffset !== null && fromOffset <= stat.size ? fromOffset : Math.max(0, stat.size - MAX_SCAN_BYTES)
    const key = `${path}|${start}`
    const cached = memo.get(key)
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return { marker: cached.marker, size: stat.size }
    const length = stat.size - start
    const buffer = Buffer.alloc(length)
    if (length > 0) {
      const handle = await fs.open(path, 'r')
      try {
        await handle.read(buffer, 0, length, start)
      } finally {
        await handle.close()
      }
    }
    const marker = hasOnlineMarker(buffer.toString('utf8'), fromOffset === null)
    memo.set(key, { mtimeMs: stat.mtimeMs, size: stat.size, marker })
    return { marker, size: stat.size }
  } catch {
    return null
  }
}
