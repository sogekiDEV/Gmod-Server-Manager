import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { TileRect } from '@shared/types'
import { pidAlive } from './procs'

export interface PlaceTarget {
  pid: number
  x: number
  y: number
  title?: string
}

export interface PlaceOutcome {
  pid: number
  found: boolean
  moved: boolean
  rect?: string
}

const SCRIPT = `param([string]$Mode, [string]$Data)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class Placer {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SetWindowText(IntPtr h, string text);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool FlashWindowEx(ref FLASHWINFO f);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }
  public static string LastRect = "";
  static void Remember(IntPtr h) { RECT r; if (GetWindowRect(h, out r)) LastRect = r.Left + "," + r.Top + "," + r.Right + "," + r.Bottom; }
  public static void Init() { SetProcessDPIAware(); }
  static IntPtr Find(HashSet<uint> pids, bool allowMinimized) {
    IntPtr best = IntPtr.Zero; long bestArea = 0;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      if (!allowMinimized && IsIconic(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!pids.Contains(pid)) return true;
      if (GetWindowTextLength(h) == 0) return true;
      RECT r; if (!GetWindowRect(h, out r)) return true;
      long area = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
      if (area > bestArea) { bestArea = area; best = h; }
      return true;
    }, IntPtr.Zero);
    return best;
  }
  public static int Place(HashSet<uint> pids, int x, int y, string title) {
    IntPtr best = Find(pids, false);
    if (best == IntPtr.Zero) return 0;
    Remember(best);
    if (!string.IsNullOrEmpty(title)) SetWindowText(best, title);
    RECT cur; GetWindowRect(best, out cur);
    if (cur.Left == x && cur.Top == y) return 1;
    return SetWindowPos(best, IntPtr.Zero, x, y, 0, 0, 0x0001 | 0x0004 | 0x0010) ? 2 : 1;
  }
  public static int Focus(HashSet<uint> pids) {
    IntPtr h = Find(pids, true);
    if (h == IntPtr.Zero) return 0;
    if (IsIconic(h)) ShowWindow(h, 9);
    SetForegroundWindow(h);
    Remember(h);
    FLASHWINFO f = new FLASHWINFO();
    f.cbSize = (uint)Marshal.SizeOf(typeof(FLASHWINFO)); f.hwnd = h; f.dwFlags = 15; f.uCount = 4; f.dwTimeout = 0;
    FlashWindowEx(ref f);
    return 1;
  }
}
'@
[Placer]::Init()
$targets = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Data)) | ConvertFrom-Json
$procs = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
$out = @()
foreach ($t in @($targets)) {
  [Placer]::LastRect = ''
  $set = New-Object 'System.Collections.Generic.HashSet[uint32]'
  [void]$set.Add([uint32]$t.pid)
  $grew = $true
  while ($grew) {
    $grew = $false
    foreach ($p in $procs) {
      if ($set.Contains([uint32]$p.ParentProcessId) -and -not $set.Contains([uint32]$p.ProcessId)) { [void]$set.Add([uint32]$p.ProcessId); $grew = $true }
    }
  }
  if ($Mode -eq 'focus') { $code = [Placer]::Focus($set) } else { $code = [Placer]::Place($set, [int]$t.x, [int]$t.y, [string]$t.title) }
  $out += [pscustomobject]@{ pid = [int]$t.pid; found = ($code -ge 1); moved = ($code -eq 2); rect = [Placer]::LastRect }
}
ConvertTo-Json -InputObject @($out) -Compress
`

let scriptPath: string | null = null

async function ensureScript(): Promise<string> {
  if (scriptPath) return scriptPath
  const path = join(tmpdir(), 'gmod-server-manager-place-v2.ps1')
  await fs.writeFile(path, '﻿' + SCRIPT, 'utf8')
  scriptPath = path
  return path
}

async function run(mode: 'place' | 'focus', targets: Array<{ pid: number } & Partial<PlaceTarget>>): Promise<PlaceOutcome[]> {
  if (targets.length === 0) return []
  const script = await ensureScript()
  const data = Buffer.from(JSON.stringify(targets), 'utf8').toString('base64')
  return new Promise((resolvePromise) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Mode', mode, '-Data', data],
      { windowsHide: true, timeout: 20000 },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolvePromise([])
          return
        }
        try {
          const parsed = JSON.parse(stdout) as PlaceOutcome | PlaceOutcome[]
          resolvePromise(Array.isArray(parsed) ? parsed : [parsed])
        } catch {
          resolvePromise([])
        }
      }
    )
  })
}

export const placeOnce = (targets: PlaceTarget[]): Promise<PlaceOutcome[]> => run('place', targets)

export interface FocusResult {
  found: boolean
  rect: TileRect | null
}

export async function focusWindow(pid: number): Promise<FocusResult> {
  const result = (await run('focus', [{ pid }])).find((r) => r.found)
  if (!result) return { found: false, rect: null }
  const parts = (result.rect ?? '').split(',').map(Number)
  const valid = parts.length === 4 && parts.every(Number.isFinite)
  return { found: true, rect: valid ? { x: parts[0], y: parts[1], width: parts[2] - parts[0], height: parts[3] - parts[1] } : null }
}

interface Pending {
  pid: number
  tile: TileRect
  title?: string
  seenAt: number | null
  reapplied: number
}

const REAPPLY_AFTER_MS = [8000, 25000]
const GIVE_UP_MS = 150000
const POLL_MS = 1500

export class WindowPlacer {
  private pending: Pending[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private deadline = 0
  private busy = false

  track(entries: Array<{ pid: number; tile: TileRect; title?: string }>): void {
    for (const entry of entries) this.pending.push({ pid: entry.pid, tile: entry.tile, title: entry.title, seenAt: null, reapplied: 0 })
    this.deadline = Date.now() + GIVE_UP_MS
    if (!this.timer) this.schedule()
  }

  forget(pid: number): void {
    this.pending = this.pending.filter((p) => p.pid !== pid)
  }

  cancel(): void {
    this.pending = []
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(): void {
    this.timer = setTimeout(() => void this.tick(), POLL_MS)
  }

  private async tick(): Promise<void> {
    this.timer = null
    if (this.busy) return this.schedule()
    this.busy = true
    try {
      const now = Date.now()
      this.pending = this.pending.filter((p) => pidAlive(p.pid) && p.reapplied < REAPPLY_AFTER_MS.length + 1)
      if (this.pending.length === 0 || now > this.deadline) {
        this.pending = []
        return
      }
      const due = this.pending.filter((p) => p.seenAt === null || now - p.seenAt >= REAPPLY_AFTER_MS[p.reapplied - 1])
      const outcomes = await placeOnce(due.map((p) => ({ pid: p.pid, x: p.tile.x, y: p.tile.y, title: p.title })))
      for (const outcome of outcomes) {
        const entry = due.find((p) => p.pid === outcome.pid)
        if (!entry || !outcome.found) continue
        if (entry.seenAt === null) entry.seenAt = Date.now()
        entry.reapplied++
      }
      this.pending = this.pending.filter((p) => p.reapplied <= REAPPLY_AFTER_MS.length)
      if (this.pending.length > 0) this.schedule()
    } finally {
      this.busy = false
      if (this.pending.length > 0 && !this.timer) this.schedule()
    }
  }
}
