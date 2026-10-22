import { useSyncExternalStore } from 'react'
import type { DataReport, ServerPreset, StatusSnapshot, SteamCacheReport } from '@shared/types'
import { translate, type Key, type Lang } from './i18n'

export type Tab = 'clients' | 'cleanup' | 'settings'

export interface Toast {
  id: number
  kind: 'ok' | 'error' | 'info'
  text: string
}

export interface State {
  demo: boolean
  lang: Lang
  presets: ServerPreset[]
  selected: string | null
  status: StatusSnapshot
  tab: Tab
  toast: Toast | null
  cache: SteamCacheReport | null
  cacheBusy: boolean
  data: DataReport | null
  dataBusy: boolean
}

export const emptyStatus: StatusSnapshot = { state: 'stopped', pid: null, startedAt: null, info: null, clients: 0, clientSlots: [], external: false }

const initial: State = {
  demo: false,
  lang: 'en',
  presets: [],
  selected: null,
  status: emptyStatus,
  tab: 'clients',
  toast: null,
  cache: null,
  cacheBusy: false,
  data: null,
  dataBusy: false
}

let state: State = initial
const listeners = new Set<() => void>()

export const getState = (): State => state

export function setState(patch: Partial<State> | ((current: State) => Partial<State>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

export function useStore<T>(selector: (current: State) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => selector(state)
  )
}

let toastId = 0

export function toast(kind: Toast['kind'], text: string): void {
  const id = ++toastId
  setState({ toast: { id, kind, text } })
  setTimeout(() => {
    if (state.toast?.id === id) setState({ toast: null })
  }, 5200)
}

export function useT(): (key: Key, params?: Record<string, string | number>) => string {
  const lang = useStore((s) => s.lang)
  return (key, params) => translate(lang, key, params)
}

export const tr = (key: Key, params?: Record<string, string | number>): string => translate(state.lang, key, params)

export const selectedPreset = (s: State): ServerPreset | null => s.presets.find((p) => p.name === s.selected) ?? null
