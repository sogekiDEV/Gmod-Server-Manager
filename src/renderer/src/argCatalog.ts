import { unquote, type ArgEntry } from '@shared/argline'
import type { Key } from './i18n'

export type ArgKind = 'text' | 'number'

export interface ArgItem {
  key: string
  kind: ArgKind
  label: Key
  hint?: Key
  placeholder?: string
}

export const CATALOG: ArgItem[] = [
  { key: '+hostname', kind: 'text', label: 'arg_hostname', placeholder: 'My dev server' },
  { key: '+map', kind: 'text', label: 'arg_map', placeholder: 'gm_construct' },
  { key: '+gamemode', kind: 'text', label: 'arg_gamemode', hint: 'arg_gamemode_h', placeholder: 'sandbox' },
  { key: '+maxplayers', kind: 'number', label: 'arg_maxplayers', placeholder: '20' },
  { key: '+host_workshop_collection', kind: 'number', label: 'arg_collection', hint: 'arg_collection_h', placeholder: '1234567890' }
]

export interface ToggleItem {
  key: string
  write: string
  accepts: string[]
  label: Key
  hint: Key
}

export const TOGGLES: ToggleItem[] = [
  { key: '+sv_lan', write: '1', accepts: ['1'], label: 'tg_lan', hint: 'tg_lan_h' },
  { key: '-insecure', write: '', accepts: [''], label: 'tg_insecure', hint: 'tg_insecure_h' },
  { key: '+r_hunkalloclightmaps', write: '0', accepts: ['0', ''], label: 'tg_hunk', hint: 'tg_hunk_h' }
]

export function toggleIsOn(entries: ArgEntry[], item: ToggleItem): boolean {
  const entry = entries.find((e) => e.key.toLowerCase() === item.key.toLowerCase())
  return entry !== undefined && item.accepts.includes(unquote(entry.value))
}

export const HIDDEN_KEYS =['-console', '-condebug', '-game']

export const isKnownArg = (key: string): boolean => {
  const lower = key.toLowerCase()
  return CATALOG.some((item) => item.key.toLowerCase() === lower) || TOGGLES.some((item) => item.key.toLowerCase() === lower) || HIDDEN_KEYS.includes(lower)
}
