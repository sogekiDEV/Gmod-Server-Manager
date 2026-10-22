import { defaultPreset, type DataReport, type ServerPreset, type SteamCacheReport } from '@shared/types'
import { setState, type Tab } from './store'
import type { Lang } from './i18n'

const GB = 1024 ** 3
const MB = 1024 ** 2

function demoPresets(): ServerPreset[] {
  return [
    {
      ...defaultPreset('Roleplay dev'),
      serverFolder: 'D:\\Servers\\GarrysModDS',
      arguments: '+hostname "Dev server" -textmode -game garrysmod +gamemode darkrp +map rp_downtown_v4c +host_workshop_collection 1234567890 +sv_lan 1 +maxplayers 25 -insecure +fps_max 66 +my_custom_cvar 5',
      clientExe: 'D:\\Steam\\steamapps\\common\\GarrysMod\\gmod.exe',
      clientCount: 4,
      autoJoin: true
    },
    { ...defaultPreset('Sandbox test'), serverFolder: 'D:\\Servers\\Sandbox', arguments: '+gamemode sandbox +map gm_construct +maxplayers 12' },
    { ...defaultPreset('Combat arena'), serverFolder: 'D:\\Servers\\Arena', arguments: '+gamemode arena +map gm_flatgrass +maxplayers 16' }
  ]
}

function demoCache(): SteamCacheReport {
  const addons = Array.from({ length: 41 }, (_, i) => {
    const stale = i % 7 < 4
    return {
      id: String(3100000000 + i * 7919),
      bytes: Math.round((stale ? 1.35 : 2.1) * GB * (0.6 + ((i * 37) % 10) / 10)),
      files: 1,
      modified: Date.now() - (stale ? 190 : 30) * 86400000 - i * 3600000,
      inCollection: !stale
    }
  }).sort((a, b) => b.bytes - a.bytes)
  const stale = addons.filter((a) => !a.inCollection)
  const keep = addons.filter((a) => a.inCollection)
  return {
    folderExists: true,
    acfExists: true,
    collectionId: '1234567890',
    collectionStatus: 'ok',
    collectionCount: keep.length,
    addons,
    totalBytes: addons.reduce((s, a) => s + a.bytes, 0),
    staleCount: stale.length,
    staleBytes: stale.reduce((s, a) => s + a.bytes, 0),
    keepCount: keep.length,
    keepBytes: keep.reduce((s, a) => s + a.bytes, 0),
    unknownFolders: [],
    legacyBytes: 864 * MB
  }
}

function demoData(): DataReport {
  return {
    folderExists: true,
    entries: [
      { name: 'inventory', isDir: true, bytes: 6.4 * MB, files: 212 },
      { name: 'combat_hud', isDir: true, bytes: 1.1 * MB, files: 14 },
      { name: 'player_stats.json', isDir: false, bytes: 380 * 1024, files: 1 },
      { name: 'settings.txt', isDir: false, bytes: 2 * 1024, files: 1 }
    ],
    svDbExists: true,
    svDbBytes: 210 * 1024
  }
}

export function loadDemo(params: URLSearchParams): void {
  const presets = demoPresets()
  const lang: Lang = params.get('lang') === 'fr' ? 'fr' : 'en'
  const running = params.get('stopped') !== '1'
  setState({
    demo: true,
    lang,
    presets,
    selected: presets[0].name,
    status: running
      ? {
          state: 'running',
          pid: 4242,
          startedAt: Date.now() - (1 * 3600 + 24 * 60 + 12) * 1000,
          info: { name: 'Dev server', map: 'rp_downtown_v4c', players: 3, maxPlayers: 25, bots: 0, pingMs: 11 },
          clients: 3,
          clientSlots: [
            { slot: 1, state: 'running' },
            { slot: 2, state: 'running' },
            { slot: 3, state: 'starting' }
          ],
          external: false
        }
      : { state: 'stopped', pid: null, startedAt: null, info: null, clients: 0, clientSlots: [], external: false },
    tab: (params.get('tab') as Tab | null) ?? 'clients',
    cache: demoCache(),
    data: demoData()
  })
}
