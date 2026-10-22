import { en, type Key } from './en'
import { fr } from './fr'

export type Lang = 'en' | 'fr'
export type { Key }

const dictionaries: Record<Lang, Record<Key, string>> = { en, fr }

export const LANGUAGES: Array<{ code: Lang; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' }
]

export function translate(lang: Lang, key: Key, params?: Record<string, string | number>): string {
  let text = dictionaries[lang][key] ?? en[key]
  if (params) for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value))
  return text
}

export function detectLang(locale: string): Lang {
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}
