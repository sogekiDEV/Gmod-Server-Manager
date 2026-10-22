export interface ArgEntry {
  key: string
  value: string
}

const TOKEN = /"[^"]*"|\S+/g

export const SECRET_KEYS = ['-authkey', '+rcon_password', '+sv_password', '+sv_setsteamaccount', '-password']

export const isFlag = (token: string): boolean => token.startsWith('+') || token.startsWith('-')

export const isSecretKey = (key: string): boolean => SECRET_KEYS.includes(key.toLowerCase())

export function parseArgs(text: string | null | undefined): ArgEntry[] {
  const tokens = text?.match(TOKEN) ?? []
  const entries: ArgEntry[] = []
  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i]
    let value = ''
    if (isFlag(key) && i + 1 < tokens.length && !isFlag(tokens[i + 1])) {
      value = tokens[i + 1]
      i++
    }
    entries.push({ key, value })
  }
  return entries
}

export function buildArgs(entries: ArgEntry[], maskSecrets = false): string {
  return entries
    .map((e) => {
      if (!e.value) return e.key
      return `${e.key} ${maskSecrets && isSecretKey(e.key) ? '********' : e.value}`
    })
    .join(' ')
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

export const hasArg = (entries: ArgEntry[], key: string): boolean => entries.some((e) => same(e.key, key))

export const getArg = (entries: ArgEntry[], key: string): string | null =>
  entries.find((e) => same(e.key, key))?.value ?? null

export function ensureArg(entries: ArgEntry[], key: string, value = ''): ArgEntry[] {
  return hasArg(entries, key) ? entries : [...entries, { key, value }]
}

export function setArg(entries: ArgEntry[], key: string, value: string): ArgEntry[] {
  const index = entries.findIndex((e) => same(e.key, key))
  if (index < 0) return [...entries, { key, value }]
  const copy = entries.slice()
  copy[index] = { key: entries[index].key, value }
  return copy
}

export function removeArg(entries: ArgEntry[], key: string): ArgEntry[] {
  return entries.filter((e) => !same(e.key, key))
}

export const unquote = (value: string): string => (value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value)

export function quoteArg(value: string): string {
  const bare = value.replace(/"/g, '')
  return /\s/.test(bare) ? `"${bare}"` : bare
}

export function toArgv(entries: ArgEntry[]): string[] {
  const argv: string[] = []
  for (const e of entries) {
    argv.push(e.key)
    if (e.value) argv.push(unquote(e.value))
  }
  return argv
}

export function serverLaunchEntries(argsText: string): ArgEntry[] {
  return ensureArg(ensureArg(ensureArg(parseArgs(argsText), '-game', 'garrysmod'), '-console'), '-condebug')
}

export function extractCollectionId(argsText: string): string | null {
  const raw = getArg(parseArgs(argsText), '+host_workshop_collection')
  if (!raw) return null
  const id = unquote(raw)
  return /^\d+$/.test(id) ? id : null
}

export function effectivePort(argsText: string, fallback: number): number {
  const entries = parseArgs(argsText)
  for (const key of ['-port', '+hostport', '+port']) {
    const raw = getArg(entries, key)
    const port = raw ? parseInt(unquote(raw), 10) : NaN
    if (Number.isFinite(port) && port > 0 && port < 65536) return port
  }
  return fallback
}
