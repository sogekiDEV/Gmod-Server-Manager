import type {
  ActionResult,
  AppInfo,
  CleanMode,
  CleanResult,
  DataCleanResult,
  DataReport,
  DisplayInfo,
  ServerPreset,
  StatusSnapshot,
  SteamCacheReport
} from './types'

export interface Api {
  appInfo(): Promise<AppInfo>
  presetsList(): Promise<ServerPreset[]>
  presetsSave(preset: ServerPreset, previousName: string | null): Promise<void>
  presetsDelete(name: string): Promise<void>
  pickFolder(title: string, initial?: string): Promise<string | null>
  pickFile(title: string, initial?: string): Promise<string | null>
  presetActivate(preset: ServerPreset): Promise<void>
  statusGet(): Promise<StatusSnapshot>
  serverStart(preset: ServerPreset): Promise<ActionResult>
  serverStop(preset: ServerPreset): Promise<ActionResult>
  clientsDetectExe(): Promise<string | null>
  clientsDisplays(): Promise<DisplayInfo[]>
  clientsLaunch(preset: ServerPreset): Promise<ActionResult>
  clientsClose(slot: number): Promise<ActionResult>
  clientsFocus(slot: number): Promise<ActionResult>
  cleanupScanCache(preset: ServerPreset): Promise<SteamCacheReport>
  cleanupRunCache(preset: ServerPreset, mode: CleanMode): Promise<CleanResult>
  cleanupScanData(preset: ServerPreset): Promise<DataReport>
  cleanupRunData(preset: ServerPreset, names: string[], includeSvDb: boolean, backup: boolean): Promise<DataCleanResult>
  openPath(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  onStatus(callback: (status: StatusSnapshot) => void): () => void
}
