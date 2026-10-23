import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron'
import { promises as fs } from 'fs'
import { basename, join } from 'path'
import { clientSize } from '@shared/types'
import type { ActionResult, AppInfo, CleanMode, DisplayInfo, ServerInfo, ServerPreset, ServerState, StatusSnapshot, TileRect } from '@shared/types'
import { effectivePort } from '@shared/argline'
import { queryServer } from './services/a2s'
import { runDataClean, scanData } from './services/dataTools'
import { consoleLogPath, logSize, readLogState } from './services/onlineDetect'
import { PresetStore } from './services/presets'
import { ClientController, ServerController, belongsTo, isServerRunningFrom, listProcessesNamed, listSrcds, planRestore, type SavedClient } from './services/procs'
import { buildCacheReport, runClean } from './services/steamCache'
import { findGmodClient } from './services/steamLocate'
import { computeTiles } from './services/tileLayout'
import { WindowPlacer, focusWindow } from './services/windowPlacer'

const userData = app.getPath('userData')
const presets = new PresetStore(join(userData, 'presets'), join(userData, 'backups', 'presets'))
const backupDir = join(userData, 'backups')
const server = new ServerController()
const clients = new ClientController()
const placer = new WindowPlacer()

let window: BrowserWindow | null = null
let active: ServerPreset | null = null
let clientsRestored = false
let savedClients = ''
const clientsFile = join(userData, 'clients.json')
let onlinePid: number | null = null
let logOffset: { pid: number; offset: number } | null = null
let lastState: ServerState = 'stopped'
let lastInfo: ServerInfo | null = null
let ticks = 0
let refreshing = false

const argValue = (name: string): string | null => {
  const index = process.argv.indexOf(name)
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null
}

if (argValue('--screenshot')) app.disableHardwareAcceleration()

async function serverRunning(folder: string): Promise<boolean> {
  return server.currentPid !== null || (await isServerRunningFrom(folder))
}

async function snapshot(): Promise<StatusSnapshot> {
  const pid = server.currentPid
  return {
    state: pid === null ? 'stopped' : lastState === 'stopped' ? 'starting' : lastState,
    pid,
    startedAt: server.startedAt,
    info: pid === null ? null : lastInfo,
    clients: clients.count(),
    clientSlots: clients.list(),
    external: server.external
  }
}

async function refreshStatus(): Promise<void> {
  if (refreshing) return
  refreshing = true
  try {
    const preset = active
    ticks++
    if (preset?.serverFolder && (server.currentPid === null || ticks % 4 === 0)) {
      const found = (await listSrcds()).find((p) => p.path !== null && belongsTo(preset.serverFolder, p))
      if (found && server.currentPid === null) server.adopt(found.pid, found.startedAt)
      else if (!found && server.currentPid !== null && server.external) server.release()
    }

    let state: ServerState = 'stopped'
    let info: ServerInfo | null = null
    const pid = server.currentPid
    if (preset && pid !== null) {
      info = await queryServer('127.0.0.1', effectivePort(preset.arguments, preset.port), 700)
      if (onlinePid !== pid) {
        const fromOffset = logOffset && logOffset.pid === pid ? logOffset.offset : null
        const log = await readLogState(consoleLogPath(preset.serverFolder), fromOffset)
        if (info !== null || log?.marker) onlinePid = pid
      }
      state = onlinePid === pid ? 'running' : 'starting'
    } else {
      onlinePid = null
    }

    const previous = lastState
    lastState = state
    lastInfo = info

    if (preset?.autoJoin && !server.external && previous !== 'running' && state === 'running' && clients.count() === 0) {
      launchClients(preset)
    }

    void persistClients()
    window?.webContents.send('status:update', await snapshot())
  } finally {
    refreshing = false
  }
}

function listDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, index) => ({
    index,
    primary: d.id === primary,
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor)
  }))
}

function chooseDisplay(index: number): Electron.Display {
  const all = screen.getAllDisplays()
  return index >= 0 && index < all.length ? all[index] : screen.getPrimaryDisplay()
}

function launchClients(preset: ServerPreset): ActionResult {
  const display = chooseDisplay(preset.screenIndex)
  const area = screen.dipToScreenRect(null, display.workArea)
  const total = preset.clientCount
  const [width, height] = clientSize(preset)
  const tiles = computeTiles(total, area, width, height)
  const taken = new Set(clients.occupied())
  const items = tiles.map((tile, index) => ({ slot: index + 1, tile })).filter((item) => !taken.has(item.slot))
  try {
    const started = clients.launch(preset, preset.address || '127.0.0.1', effectivePort(preset.arguments, preset.port), items, (placed) => {
      if (preset.screenMode !== 'fullscreen') {
        placer.track(placed.map((p) => ({ pid: p.pid, tile: p.tile, title: `Garry's Mod · Client ${p.slot}` })))
      }
    })
    return { ok: true, count: started }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

function showSlotOverlay(slot: number, rect: TileRect): void {
  const bounds = screen.screenToDipRect(null, rect)
  const overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: { sandbox: true }
  })
  overlay.setIgnoreMouseEvents(true)
  overlay.setAlwaysOnTop(true, 'screen-saver')
  const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden}
body{box-sizing:border-box;border:6px solid #7f95ff;background:rgba(127,149,255,.12);display:grid;place-items:center;font-family:'Segoe UI',sans-serif;animation:f 2.4s ease forwards}
div{width:min(46vh,46vw);height:min(46vh,46vw);border-radius:50%;background:rgba(14,16,20,.88);border:5px solid #7f95ff;color:#fff;display:grid;place-items:center;font-size:min(30vh,30vw);font-weight:800}
@keyframes f{0%{opacity:0}10%{opacity:1}75%{opacity:1}100%{opacity:0}}
</style><div>${slot}</div>`
  void overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  overlay.once('ready-to-show', () => overlay.showInactive())
  setTimeout(() => {
    if (!overlay.isDestroyed()) overlay.close()
  }, 2500)
}

async function restoreClients(preset: ServerPreset): Promise<void> {
  if (clientsRestored) return
  let saved: SavedClient[] = []
  try {
    const parsed = JSON.parse(await fs.readFile(clientsFile, 'utf8')) as { slots?: SavedClient[] }
    if (Array.isArray(parsed.slots)) saved = parsed.slots
  } catch {
    saved = []
  }
  const rows = await listProcessesNamed(basename(preset.clientExe.trim() || 'gmod.exe'))
  for (const entry of planRestore(saved, rows)) clients.restore(entry)
  savedClients = JSON.stringify(saved)
  clientsRestored = true
}

async function persistClients(): Promise<void> {
  if (!clientsRestored) return
  const slots = clients.exportSlots()
  const text = JSON.stringify(slots)
  if (text === savedClients) return
  savedClients = text
  try {
    await fs.writeFile(clientsFile, JSON.stringify({ slots }, null, 1), 'utf8')
  } catch {
    savedClients = ''
  }
}

async function activate(preset: ServerPreset): Promise<void> {
  active = preset
  onlinePid = null
  await restoreClients(preset)
  void refreshStatus()
}

function registerIpc(): void {
  ipcMain.handle('app:info', (): AppInfo => ({ version: app.getVersion(), locale: app.getLocale(), dataDir: userData }))
  ipcMain.handle('presets:list', () => presets.list())
  ipcMain.handle('presets:save', (_e, preset: ServerPreset, previous: string | null) => presets.save(preset, previous))
  ipcMain.handle('presets:delete', (_e, name: string) => presets.remove(name))

  ipcMain.handle('dialog:folder', async (_e, title: string, initial?: string) => {
    const result = await dialog.showOpenDialog(window as BrowserWindow, { title, defaultPath: initial || undefined, properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('dialog:file', async (_e, title: string, initial?: string) => {
    const result = await dialog.showOpenDialog(window as BrowserWindow, {
      title,
      defaultPath: initial || undefined,
      properties: ['openFile'],
      filters: [{ name: 'Executable', extensions: ['exe'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('preset:activate', (_e, preset: ServerPreset) => activate(preset))
  ipcMain.handle('status:get', () => snapshot())

  ipcMain.handle('server:start', async (_e, preset: ServerPreset): Promise<ActionResult> => {
    try {
      const offset = await logSize(consoleLogPath(preset.serverFolder))
      await server.start(preset)
      logOffset = server.currentPid === null ? null : { pid: server.currentPid, offset }
      lastState = 'stopped'
      await activate(preset)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })
  ipcMain.handle('server:stop', async (): Promise<ActionResult> => {
    try {
      await server.stop()
      lastState = 'stopped'
      lastInfo = null
      void refreshStatus()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('clients:detectExe', () => findGmodClient())
  ipcMain.handle('clients:displays', () => listDisplays())
  ipcMain.handle('clients:launch', (_e, preset: ServerPreset) => launchClients(preset))
  ipcMain.handle('clients:close', async (_e, slot: number): Promise<ActionResult> => {
    const pid = clients.pidOf(slot)
    if (pid !== null) placer.forget(pid)
    const closed = await clients.close(slot)
    void refreshStatus()
    return { ok: closed }
  })
  ipcMain.handle('clients:focus', async (_e, slot: number): Promise<ActionResult> => {
    const pid = clients.pidOf(slot)
    if (pid === null) return { ok: false }
    const result = await focusWindow(pid)
    if (result.rect) showSlotOverlay(slot, result.rect)
    return { ok: result.found }
  })

  ipcMain.handle('cleanup:scanCache', (_e, preset: ServerPreset) => buildCacheReport(preset.serverFolder, preset.arguments))
  ipcMain.handle('cleanup:runCache', (_e, preset: ServerPreset, mode: CleanMode) =>
    runClean({
      serverFolder: preset.serverFolder,
      argsText: preset.arguments,
      mode,
      backupDir,
      isServerRunning: () => serverRunning(preset.serverFolder)
    })
  )
  ipcMain.handle('cleanup:scanData', (_e, preset: ServerPreset) => scanData(preset.serverFolder))
  ipcMain.handle('cleanup:runData', (_e, preset: ServerPreset, names: string[], includeSvDb: boolean, backup: boolean) =>
    runDataClean({
      serverFolder: preset.serverFolder,
      names,
      includeSvDb,
      backup,
      backupDir,
      isServerRunning: () => serverRunning(preset.serverFolder)
    })
  )

  ipcMain.handle('util:openPath', async (_e, path: string) => {
    await shell.openPath(path)
  })
  ipcMain.handle('util:openExternal', async (_e, url: string) => {
    if (/^https:\/\/(steamcommunity\.com|github\.com)\//.test(url)) await shell.openExternal(url)
  })
}

async function createWindow(): Promise<void> {
  const screenshot = argValue('--screenshot')
  window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1020,
    minHeight: 640,
    x: screenshot ? -6000 : undefined,
    y: screenshot ? 0 : undefined,
    show: true,
    backgroundColor: '#0e1014',
    autoHideMenuBar: true,
    title: 'Server Manager',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (screenshot) {
    window.webContents.on('console-message', (_event, level, message, line, source) => {
      console.log(`[renderer:${level}] ${message} (${source}:${line})`)
    })
    window.webContents.on('did-fail-load', (_event, code, description, url) => console.log(`[load-fail] ${code} ${description} ${url}`))
    window.webContents.on('render-process-gone', (_event, details) => console.log(`[gone] ${details.reason}`))
  }

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  const query = argValue('--query') ?? ''
  if (process.env['ELECTRON_RENDERER_URL']) {
    await window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${query ? `?${query}` : ''}`)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  }

  if (screenshot) {
    setTimeout(async () => {
      let saved = false
      for (let attempt = 0; attempt < 5 && !saved; attempt++) {
        try {
          const image = await window?.webContents.capturePage()
          if (image && !image.isEmpty()) {
            await fs.writeFile(screenshot, image.toPNG())
            saved = true
          }
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 600))
        }
      }
      app.exit(saved ? 0 : 1)
    }, 1800)
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  void app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark'
    Menu.setApplicationMenu(null)
    registerIpc()
    await createWindow()
    setInterval(() => void refreshStatus(), 2000)
  })

  app.on('window-all-closed', () => app.quit())
}
