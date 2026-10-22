import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/ipc'
import type { StatusSnapshot } from '@shared/types'

const call = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

const subscribe = <T>(channel: string, callback: (value: T) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: Api = {
  appInfo: () => call('app:info'),
  presetsList: () => call('presets:list'),
  presetsSave: (preset, previousName) => call('presets:save', preset, previousName),
  presetsDelete: (name) => call('presets:delete', name),
  pickFolder: (title, initial) => call('dialog:folder', title, initial),
  pickFile: (title, initial) => call('dialog:file', title, initial),
  presetActivate: (preset) => call('preset:activate', preset),
  statusGet: () => call('status:get'),
  serverStart: (preset) => call('server:start', preset),
  serverStop: (preset) => call('server:stop', preset),
  clientsDetectExe: () => call('clients:detectExe'),
  clientsDisplays: () => call('clients:displays'),
  clientsLaunch: (preset) => call('clients:launch', preset),
  clientsClose: (slot) => call('clients:close', slot),
  clientsFocus: (slot) => call('clients:focus', slot),
  cleanupScanCache: (preset) => call('cleanup:scanCache', preset),
  cleanupRunCache: (preset, mode) => call('cleanup:runCache', preset, mode),
  cleanupScanData: (preset) => call('cleanup:scanData', preset),
  cleanupRunData: (preset, names, includeSvDb, backup) => call('cleanup:runData', preset, names, includeSvDb, backup),
  openPath: (path) => call('util:openPath', path),
  openExternal: (url) => call('util:openExternal', url),
  onStatus: (callback) => subscribe<StatusSnapshot>('status:update', callback)
}

contextBridge.exposeInMainWorld('api', api)
