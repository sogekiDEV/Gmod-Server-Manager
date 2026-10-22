import type { Lang } from './i18n'

const UNITS: Record<Lang, string[]> = {
  en: ['B', 'KB', 'MB', 'GB', 'TB'],
  fr: ['o', 'Ko', 'Mo', 'Go', 'To']
}

export function formatBytes(bytes: number, lang: Lang): string {
  let value = Math.abs(bytes)
  let unit = 0
  while (value >= 1024 && unit < UNITS[lang].length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 ? 0 : value >= 100 ? 0 : 1
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
  return `${bytes < 0 ? '-' : ''}${number} ${UNITS[lang][unit]}`
}

export function formatUptime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`
}

export function formatClock(timestamp: number): string {
  const d = new Date(timestamp)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function formatDate(timestamp: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(timestamp))
}

export function folderLabel(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] || trimmed
}
