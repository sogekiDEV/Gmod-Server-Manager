import { defaultPreset, type CleanErrorCode, type ServerPreset } from '@shared/types'
import { detectLang, type Key, type Lang } from './i18n'
import { emptyStatus, getState, selectedPreset, setState, toast, tr } from './store'

const LANG_KEY = 'server-manager-lang'
const SELECTED_KEY = 'server-manager-selected'

let persistedName: string | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let attachTimer: ReturnType<typeof setTimeout> | null = null

export function errorKey(code: CleanErrorCode | string | undefined): Key {
  const known: Record<string, Key> = {
    server_running: 'err_server_running',
    no_server_folder: 'err_no_server_folder',
    no_collection: 'err_no_collection',
    collection_unavailable: 'err_collection_unavailable',
    collection_empty: 'err_collection_empty',
    would_remove_everything: 'err_would_remove_everything',
    unsafe_path: 'err_unsafe_path',
    backup_failed: 'err_backup_failed',
    acf_invalid: 'err_acf_invalid',
    verify_failed: 'err_verify_failed',
    nothing_selected: 'err_nothing_selected',
    srcds_not_found: 'err_srcds_not_found',
    already_running: 'err_already_running',
    start_failed: 'err_start_failed'
  }
  return known[code ?? ''] ?? 'err_unknown'
}

export function setLang(lang: Lang): void {
  localStorage.setItem(LANG_KEY, lang)
  setState({ lang })
}

export async function boot(): Promise<void> {
  const info = await window.api.appInfo()
  const stored = localStorage.getItem(LANG_KEY) as Lang | null
  setState({ lang: stored === 'en' || stored === 'fr' ? stored : detectLang(info.locale) })

  const [presets, status] = await Promise.all([window.api.presetsList(), window.api.statusGet()])
  const remembered = localStorage.getItem(SELECTED_KEY)
  const first = presets.find((p) => p.name === remembered) ?? presets[0] ?? null
  setState({ presets, status, selected: first?.name ?? null })
  if (first) await attach(first)

  window.api.onStatus((status) => setState({ status }))
}

async function attach(preset: ServerPreset): Promise<void> {
  persistedName = preset.name
  setState({ cache: null, data: null })
  await window.api.presetActivate(preset)
}

export async function selectPreset(name: string): Promise<void> {
  const preset = getState().presets.find((p) => p.name === name)
  if (!preset) return
  localStorage.setItem(SELECTED_KEY, name)
  setState({ selected: name, status: emptyStatus })
  await attach(preset)
  setState({ status: await window.api.statusGet() })
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const preset = selectedPreset(getState())
    if (!preset || !preset.name.trim()) return
    const clash = getState().presets.filter((p) => p.name.toLowerCase() === preset.name.toLowerCase()).length > 1
    if (clash) return
    await window.api.presetsSave(preset, persistedName)
    persistedName = preset.name
    localStorage.setItem(SELECTED_KEY, preset.name)
  }, 450)
}

export function updatePreset(patch: Partial<ServerPreset>): void {
  const current = selectedPreset(getState())
  if (!current) return
  const next = { ...current, ...patch }
  setState((s) => ({ presets: s.presets.map((p) => (p === current ? next : p)), selected: next.name }))
  scheduleSave()
  if ('serverFolder' in patch || 'arguments' in patch) {
    if (attachTimer) clearTimeout(attachTimer)
    attachTimer = setTimeout(() => {
      const preset = selectedPreset(getState())
      if (preset) void window.api.presetActivate(preset)
    }, 900)
  }
}

export async function createPreset(): Promise<void> {
  const names = new Set(getState().presets.map((p) => p.name.toLowerCase()))
  const base = tr('new_preset')
  let name = base
  for (let i = 2; names.has(name.toLowerCase()); i++) name = `${base} ${i}`
  const preset = defaultPreset(name)
  await window.api.presetsSave(preset, null)
  setState((s) => ({ presets: [...s.presets, preset], tab: 'settings' }))
  await selectPreset(name)
  setState({ tab: 'settings' })
}

export async function deleteSelectedPreset(): Promise<void> {
  const preset = selectedPreset(getState())
  if (!preset) return
  await window.api.presetsDelete(preset.name)
  const rest = getState().presets.filter((p) => p !== preset)
  setState({ presets: rest, selected: rest[0]?.name ?? null, tab: 'clients' })
  if (rest[0]) await selectPreset(rest[0].name)
}

export async function pickServerFolder(): Promise<void> {
  const preset = selectedPreset(getState())
  if (!preset) return
  const folder = await window.api.pickFolder(tr('settings_pick_folder'), preset.serverFolder)
  if (folder) updatePreset({ serverFolder: folder })
}

export async function pickClientExe(): Promise<void> {
  const preset = selectedPreset(getState())
  if (!preset) return
  const file = await window.api.pickFile(tr('pick_client'), preset.clientExe)
  if (file) updatePreset({ clientExe: file })
}

export async function startServer(): Promise<void> {
  const preset = selectedPreset(getState())
  if (!preset) return
  const result = await window.api.serverStart(preset)
  if (result.ok) toast('ok', tr('toast_started'))
  else toast('error', `${tr('toast_start_failed')} ${tr(errorKey(result.error))}`)
  setState({ status: await window.api.statusGet() })
}

export async function stopServer(): Promise<void> {
  const preset = selectedPreset(getState())
  if (!preset) return
  const result = await window.api.serverStop(preset)
  toast(result.ok ? 'info' : 'error', result.ok ? tr('toast_stopped') : tr('err_unknown'))
  setState({ status: await window.api.statusGet() })
}

export async function restartServer(): Promise<void> {
  await stopServer()
  await startServer()
}

export async function launchClients(): Promise<void> {
  const preset = selectedPreset(getState())
  if (!preset) return
  const result = await window.api.clientsLaunch(preset)
  if (result.ok) toast('ok', result.count ? tr('clients_launched', { n: result.count }) : tr('clients_all_launched'))
  else toast('error', result.error?.includes('not found') ? tr('err_client_not_found') : tr('err_unknown'))
  setState({ status: await window.api.statusGet() })
}

export async function closeClient(slot: number): Promise<void> {
  if (getState().demo) return
  const result = await window.api.clientsClose(slot)
  if (result.ok) toast('info', tr('client_closed', { n: slot }))
  setState({ status: await window.api.statusGet() })
}

export async function focusClient(slot: number): Promise<void> {
  if (getState().demo) return
  await window.api.clientsFocus(slot)
}

export async function scanCache(): Promise<void> {
  if (getState().demo) return
  const preset = selectedPreset(getState())
  if (!preset || !preset.serverFolder.trim()) {
    setState({ cache: null })
    return
  }
  setState({ cacheBusy: true })
  try {
    setState({ cache: await window.api.cleanupScanCache(preset) })
  } finally {
    setState({ cacheBusy: false })
  }
}

export async function scanData(): Promise<void> {
  if (getState().demo) return
  const preset = selectedPreset(getState())
  if (!preset || !preset.serverFolder.trim()) {
    setState({ data: null })
    return
  }
  setState({ dataBusy: true })
  try {
    setState({ data: await window.api.cleanupScanData(preset) })
  } finally {
    setState({ dataBusy: false })
  }
}
