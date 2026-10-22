export interface AcfCounts {
  installed: number
  details: number
}

const SECTIONS = ['WorkshopItemsInstalled', 'WorkshopItemDetails'] as const

type Section = (typeof SECTIONS)[number]

const ENTRY = /^"(\d+)"$/

function eolOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

export function removeAcfEntries(text: string, ids: Set<string>): { text: string; removed: AcfCounts } {
  const eol = eolOf(text)
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  const removed: AcfCounts = { installed: 0, details: 0 }
  let depth = 0
  let section: Section | null = null

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    if (section && depth === 2) {
      const match = ENTRY.exec(trimmed)
      if (match && lines[i + 1]?.trim() === '{') {
        let nested = 0
        let end = i + 1
        for (; end < lines.length; end++) {
          const t = lines[end].trim()
          if (t === '{') nested++
          else if (t === '}') {
            nested--
            if (nested === 0) break
          }
        }
        if (ids.has(match[1])) {
          if (section === 'WorkshopItemsInstalled') removed.installed++
          else removed.details++
        } else {
          for (let k = i; k <= end && k < lines.length; k++) out.push(lines[k])
        }
        i = end
        continue
      }
    }

    if (trimmed === '{') depth++
    else if (trimmed === '}') {
      depth--
      if (section && depth === 1) section = null
    } else if (depth === 1) {
      const name = trimmed.replace(/^"|"$/g, '')
      if ((SECTIONS as readonly string[]).includes(name) && trimmed === `"${name}"`) section = name as Section
    }
    out.push(lines[i])
  }

  return { text: out.join(eol), removed }
}

export function listAcfIds(text: string): { installed: string[]; details: string[] } {
  const lines = text.split(/\r?\n/)
  const result = { installed: [] as string[], details: [] as string[] }
  let depth = 0
  let section: Section | null = null
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (section && depth === 2) {
      const match = ENTRY.exec(trimmed)
      if (match && lines[i + 1]?.trim() === '{') {
        if (section === 'WorkshopItemsInstalled') result.installed.push(match[1])
        else result.details.push(match[1])
        let nested = 0
        let end = i + 1
        for (; end < lines.length; end++) {
          const t = lines[end].trim()
          if (t === '{') nested++
          else if (t === '}') {
            nested--
            if (nested === 0) break
          }
        }
        i = end
        continue
      }
    }
    if (trimmed === '{') depth++
    else if (trimmed === '}') {
      depth--
      if (section && depth === 1) section = null
    } else if (depth === 1) {
      const name = trimmed.replace(/^"|"$/g, '')
      if ((SECTIONS as readonly string[]).includes(name) && trimmed === `"${name}"`) section = name as Section
    }
  }
  return result
}

export function validateAcf(text: string): boolean {
  let depth = 0
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim()
    if (t === '{') depth++
    else if (t === '}') {
      depth--
      if (depth < 0) return false
    }
  }
  return depth === 0 && text.includes('"AppWorkshop"')
}
