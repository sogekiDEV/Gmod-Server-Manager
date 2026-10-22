export type ScreenMode = 'window' | 'noborder' | 'fullscreen'

export interface ServerPreset {
  name: string
  serverFolder: string
  arguments: string
  clientExe: string
  clientArguments: string
  address: string
  port: number
  clientCount: number
  screenMode: ScreenMode
  width: number
  height: number
  screenIndex: number
  autoJoin: boolean
}

export const CLIENT_SIZES: ReadonlyArray<readonly [number, number]> = [
  [1280, 720],
  [1600, 900],
  [1920, 1080]
]

export function clientSize(preset: Pick<ServerPreset, 'width' | 'height'>): readonly [number, number] {
  return CLIENT_SIZES.find(([w, h]) => w === preset.width && h === preset.height) ?? CLIENT_SIZES[0]
}

export interface DisplayInfo {
  index: number
  primary: boolean
  width: number
  height: number
}

export const defaultPreset = (name = 'New preset'): ServerPreset => ({
  name,
  serverFolder: '',
  arguments: '',
  clientExe: '',
  clientArguments: '-multirun -insecure -fullwindowsdump -nodns -nopreload',
  address: '127.0.0.1',
  port: 27015,
  clientCount: 1,
  screenMode: 'window',
  width: 1280,
  height: 720,
  screenIndex: -1,
  autoJoin: false
})

export type ServerState = 'stopped' | 'starting' | 'running'

export interface ServerInfo {
  name: string
  map: string
  players: number
  maxPlayers: number
  bots: number
  pingMs: number
}

export interface ClientSlot {
  slot: number
  state: 'starting' | 'running'
}

export interface StatusSnapshot {
  state: ServerState
  pid: number | null
  startedAt: number | null
  info: ServerInfo | null
  clients: number
  clientSlots: ClientSlot[]
  external: boolean
}

export interface TileRect {
  x: number
  y: number
  width: number
  height: number
}

export type CleanErrorCode =
  | 'server_running'
  | 'no_server_folder'
  | 'no_collection'
  | 'collection_unavailable'
  | 'collection_empty'
  | 'would_remove_everything'
  | 'unsafe_path'
  | 'backup_failed'
  | 'acf_invalid'
  | 'verify_failed'
  | 'nothing_selected'
  | 'unknown'

export type CleanMode = 'stale' | 'all'

export interface CacheAddonInfo {
  id: string
  bytes: number
  files: number
  modified: number
  inCollection: boolean | null
}

export interface SteamCacheReport {
  folderExists: boolean
  acfExists: boolean
  collectionId: string | null
  collectionStatus: 'ok' | 'no_collection' | 'unavailable'
  collectionCount: number
  addons: CacheAddonInfo[]
  totalBytes: number
  staleCount: number
  staleBytes: number
  keepCount: number
  keepBytes: number
  unknownFolders: string[]
  legacyBytes: number
}

export interface CleanResult {
  ok: boolean
  error?: CleanErrorCode
  detail?: string
  removedCount: number
  freedBytes: number
  remainingCount: number
  backupPath: string | null
  failed: string[]
}

export interface DataEntry {
  name: string
  isDir: boolean
  bytes: number
  files: number
}

export interface DataReport {
  folderExists: boolean
  entries: DataEntry[]
  svDbExists: boolean
  svDbBytes: number
}

export interface DataCleanResult {
  ok: boolean
  error?: CleanErrorCode
  detail?: string
  deleted: string[]
  freedBytes: number
  backupPath: string | null
}

export interface AppInfo {
  version: string
  locale: string
  dataDir: string
}

export interface ActionResult {
  ok: boolean
  error?: string
  count?: number
}
