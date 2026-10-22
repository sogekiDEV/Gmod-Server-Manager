import { execFile, spawn } from 'child_process'
import { basename, join, resolve } from 'path'
import type { ClientSlot, ServerPreset, TileRect } from '@shared/types'
import { parseArgs, serverLaunchEntries, toArgv } from '@shared/argline'
import { exists } from './fsUtil'

export interface SrcdsProcess {
  pid: number
  path: string | null
  startedAt: number | null
}

const LIST_SCRIPT =
  "Get-CimInstance Win32_Process -Filter \"Name='srcds.exe'\" | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; path = $_.ExecutablePath; started = $(if ($_.CreationDate) { [int64]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { $null }) } } | ConvertTo-Json -Compress"

export function listSrcds(): Promise<SrcdsProcess[]> {
  return new Promise((resolvePromise) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', LIST_SCRIPT], { windowsHide: true, timeout: 15000 }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolvePromise([])
        return
      }
      try {
        const parsed = JSON.parse(stdout) as { pid: number; path: string | null; started: number | null } | Array<{ pid: number; path: string | null; started: number | null }>
        const rows = Array.isArray(parsed) ? parsed : [parsed]
        resolvePromise(rows.map((r) => ({ pid: r.pid, path: r.path, startedAt: r.started })))
      } catch {
        resolvePromise([])
      }
    })
  })
}

const normalize = (p: string): string => resolve(p).toLowerCase().replace(/[\\/]+$/, '')

export function belongsTo(folder: string, process: SrcdsProcess): boolean {
  if (!process.path) return true
  return normalize(process.path).startsWith(normalize(folder) + '\\')
}

export async function findServerProcess(folder: string): Promise<SrcdsProcess | null> {
  if (!folder.trim()) return null
  const all = await listSrcds()
  return all.find((p) => belongsTo(folder, p)) ?? null
}

export async function isServerRunningFrom(folder: string): Promise<boolean> {
  return (await findServerProcess(folder)) !== null
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function taskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolvePromise) => {
    const args = ['/PID', String(pid), '/T']
    if (force) args.push('/F')
    execFile('taskkill', args, { windowsHide: true }, () => resolvePromise())
  })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function stopPid(pid: number, graceMs = 8000): Promise<void> {
  if (!pidAlive(pid)) return
  await taskkill(pid, false)
  const deadline = Date.now() + graceMs
  while (Date.now() < deadline && pidAlive(pid)) await sleep(250)
  if (pidAlive(pid)) {
    await taskkill(pid, true)
    for (let i = 0; i < 20 && pidAlive(pid); i++) await sleep(250)
  }
}

const winQuote = (arg: string): string => (arg === '' || /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '')}"` : arg)

export function launchInNewConsole(exe: string, args: string[], cwd: string): void {
  const child = spawn('cmd.exe', ['/c', 'start', '""', winQuote(exe), ...args.map(winQuote)], {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true
  })
  child.on('error', () => undefined)
  child.unref()
}

async function waitForNewServer(folder: string, before: Set<number>, timeoutMs: number): Promise<SrcdsProcess | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(500)
    const found = (await listSrcds()).find((p) => !before.has(p.pid) && belongsTo(folder, p))
    if (found) return found
  }
  return null
}

export class ServerController {
  private pid: number | null = null
  startedAt: number | null = null
  external = false

  get currentPid(): number | null {
    return this.pid !== null && pidAlive(this.pid) ? this.pid : null
  }

  adopt(pid: number, startedAt: number | null): void {
    this.pid = pid
    this.startedAt = startedAt
    this.external = true
  }

  release(): void {
    this.pid = null
    this.startedAt = null
    this.external = false
  }

  async start(preset: ServerPreset): Promise<void> {
    if (this.currentPid !== null) throw new Error('already_running')
    const exe = join(preset.serverFolder, 'srcds.exe')
    if (!(await exists(exe))) throw new Error('srcds_not_found')
    const before = new Set((await listSrcds()).map((p) => p.pid))
    const launchedAt = Date.now()
    launchInNewConsole(exe, toArgv(serverLaunchEntries(preset.arguments)), preset.serverFolder)
    const found = await waitForNewServer(preset.serverFolder, before, 20000)
    if (!found) throw new Error('start_failed')
    this.pid = found.pid
    this.startedAt = found.startedAt ?? launchedAt
    this.external = false
  }

  async stop(): Promise<void> {
    const pid = this.pid
    if (pid !== null) await stopPid(pid)
    this.release()
  }
}

export function modeArgs(mode: ServerPreset['screenMode']): string[] {
  if (mode === 'fullscreen') return ['-fullscreen']
  if (mode === 'noborder') return ['-windowed', '-noborder']
  return ['-windowed']
}

export interface ProcRow {
  pid: number
  started: number | null
  cmd: string
}

export function listProcessesNamed(name: string): Promise<ProcRow[]> {
  const safe = name.replace(/[^\w. -]/g, '')
  const script = `Get-CimInstance Win32_Process -Filter "Name='${safe}'" | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; started = $(if ($_.CreationDate) { [int64]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { $null }); cmd = [string]$_.CommandLine } } | ConvertTo-Json -Compress`
  return new Promise((resolvePromise) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error || !stdout.trim()) return resolvePromise([])
      try {
        const parsed = JSON.parse(stdout) as ProcRow | ProcRow[]
        resolvePromise(Array.isArray(parsed) ? parsed : [parsed])
      } catch {
        resolvePromise([])
      }
    })
  })
}

export function findClientProcess(rows: ProcRow[], tile: TileRect, claimed: Set<number>, since: number): ProcRow | null {
  const tag = ` -x ${tile.x} -y ${tile.y}`
  const matches = rows.filter(
    (r) =>
      !claimed.has(r.pid) &&
      r.cmd.includes('+connect') &&
      !r.cmd.includes('--type=') &&
      r.cmd.trimEnd().endsWith(tag) &&
      (r.started === null || r.started >= since - 2000)
  )
  matches.sort((a, b) => (b.started ?? 0) - (a.started ?? 0))
  return matches[0] ?? null
}

export interface PlacedClient {
  slot: number
  pid: number
  tile: TileRect
}

interface SlotEntry {
  launcher: number
  pid: number | null
  started: number | null
  tile: TileRect
  launchedAt: number
}

export interface SavedClient {
  slot: number
  pid: number
  started: number | null
  tile: TileRect
}

const STRAY_CLIENT = /\s-x\s+-?\d+\s+-y\s+-?\d+\s*$/

export function parseTile(cmd: string): TileRect {
  const num = (flag: string): number => {
    const match = new RegExp('\\s' + flag + '\\s+(-?\\d+)').exec(cmd)
    return match ? parseInt(match[1], 10) : 0
  }
  return { x: num('-x'), y: num('-y'), width: num('-w'), height: num('-h') }
}

const sameStart = (a: number | null, b: number | null): boolean => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) <= 2000)

export function planRestore(saved: SavedClient[], rows: ProcRow[]): SavedClient[] {
  const live = rows.filter((r) => r.cmd.includes('+connect') && !r.cmd.includes('--type='))
  const used = new Set<number>()
  const taken = new Set<number>()
  const result: SavedClient[] = []
  for (const entry of saved) {
    if (taken.has(entry.slot)) continue
    const row = live.find((r) => r.pid === entry.pid && !used.has(r.pid) && sameStart(r.started, entry.started))
    if (!row) continue
    used.add(row.pid)
    taken.add(entry.slot)
    result.push({ slot: entry.slot, pid: row.pid, started: row.started, tile: entry.tile })
  }
  const strays = live.filter((r) => !used.has(r.pid) && STRAY_CLIENT.test(r.cmd)).sort((a, b) => (a.started ?? 0) - (b.started ?? 0))
  let next = 1
  for (const row of strays) {
    while (taken.has(next)) next++
    taken.add(next)
    result.push({ slot: next, pid: row.pid, started: row.started, tile: parseTile(row.cmd) })
  }
  return result
}

const RESOLVE_GIVE_UP_MS = 42000

export class ClientController {
  private readonly slots = new Map<number, SlotEntry>()

  private prune(): void {
    const now = Date.now()
    for (const [slot, entry] of [...this.slots]) {
      if (entry.pid !== null && !pidAlive(entry.pid)) this.slots.delete(slot)
      else if (entry.pid === null && now - entry.launchedAt > RESOLVE_GIVE_UP_MS + 5000) this.slots.delete(slot)
    }
  }

  count(): number {
    this.prune()
    return this.slots.size
  }

  list(): ClientSlot[] {
    this.prune()
    return [...this.slots.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([slot, entry]) => ({ slot, state: entry.pid === null ? 'starting' : 'running' }))
  }

  occupied(): number[] {
    this.prune()
    return [...this.slots.keys()]
  }

  exportSlots(): SavedClient[] {
    this.prune()
    return [...this.slots.entries()]
      .filter(([, entry]) => entry.pid !== null)
      .sort((a, b) => a[0] - b[0])
      .map(([slot, entry]) => ({ slot, pid: entry.pid as number, started: entry.started, tile: entry.tile }))
  }

  restore(entry: SavedClient): void {
    if (this.slots.has(entry.slot)) return
    this.slots.set(entry.slot, { launcher: entry.pid, pid: entry.pid, started: entry.started, tile: entry.tile, launchedAt: Date.now() })
  }

  pidOf(slot: number): number | null {
    return this.slots.get(slot)?.pid ?? null
  }

  launch(preset: ServerPreset, address: string, port: number, items: Array<{ slot: number; tile: TileRect }>, onResolved: (placed: PlacedClient[]) => void): number {
    const started: Array<{ slot: number; entry: SlotEntry }> = []
    for (const { slot, tile } of items) {
      if (this.slots.has(slot)) continue
      const args = [
        ...toArgv(parseArgs(preset.clientArguments)),
        '+connect',
        `${address}:${port}`,
        ...modeArgs(preset.screenMode),
        '-w',
        String(tile.width),
        '-h',
        String(tile.height),
        '-x',
        String(tile.x),
        '-y',
        String(tile.y)
      ]
      const child = spawn(preset.clientExe, args, { detached: true, stdio: 'ignore', cwd: resolve(preset.clientExe, '..') })
      child.on('error', () => undefined)
      child.unref()
      if (!child.pid) continue
      const entry: SlotEntry = { launcher: child.pid, pid: null, started: null, tile, launchedAt: Date.now() }
      this.slots.set(slot, entry)
      started.push({ slot, entry })
    }
    if (started.length > 0) void this.resolve(basename(preset.clientExe), started, onResolved)
    return started.length
  }

  private claimed(): Set<number> {
    const pids = new Set<number>()
    for (const entry of this.slots.values()) if (entry.pid !== null) pids.add(entry.pid)
    return pids
  }

  private async resolve(name: string, items: Array<{ slot: number; entry: SlotEntry }>, onResolved: (placed: PlacedClient[]) => void): Promise<void> {
    const since = Date.now()
    let remaining = items.slice()
    const stillOurs = (item: { slot: number; entry: SlotEntry }): boolean => this.slots.get(item.slot) === item.entry
    for (let i = 0; i < 60 && remaining.length > 0; i++) {
      await sleep(700)
      remaining = remaining.filter(stillOurs)
      if (remaining.length === 0) return
      const rows = await listProcessesNamed(name)
      const claimed = this.claimed()
      const placed: PlacedClient[] = []
      for (const item of remaining) {
        const match = findClientProcess(rows, item.entry.tile, claimed, since)
        if (!match) continue
        claimed.add(match.pid)
        item.entry.pid = match.pid
        item.entry.started = match.started
        placed.push({ slot: item.slot, pid: match.pid, tile: item.entry.tile })
      }
      remaining = remaining.filter((item) => item.entry.pid === null)
      if (placed.length > 0) onResolved(placed)
    }
    const fallback: PlacedClient[] = []
    for (const item of remaining.filter(stillOurs)) {
      if (pidAlive(item.entry.launcher)) {
        item.entry.pid = item.entry.launcher
        fallback.push({ slot: item.slot, pid: item.entry.launcher, tile: item.entry.tile })
      } else this.slots.delete(item.slot)
    }
    if (fallback.length > 0) onResolved(fallback)
  }

  async close(slot: number): Promise<boolean> {
    const entry = this.slots.get(slot)
    if (!entry) return false
    this.slots.delete(slot)
    const targets = [...new Set([entry.pid, entry.launcher].filter((pid): pid is number => pid !== null))].filter(pidAlive)
    await Promise.all(targets.map((pid) => taskkill(pid, true)))
    return true
  }
}