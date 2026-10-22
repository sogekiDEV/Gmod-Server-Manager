import { promises as fs } from 'fs'
import { join } from 'path'
import { defaultPreset, type ServerPreset } from '@shared/types'

export function parseLegacyPreset(lines: string[]): ServerPreset | null {
  if (lines.length < 3 || !lines[2].trim()) return null
  return { ...defaultPreset(lines[2].trim()), serverFolder: lines[0].trim(), arguments: lines[1].trim() }
}

export class PresetStore {
  constructor(private readonly dir: string) {}

  private fileFor(name: string): string {
    const safe = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'preset'
    return join(this.dir, `${safe}.json`)
  }

  async list(): Promise<ServerPreset[]> {
    await fs.mkdir(this.dir, { recursive: true })
    const names = (await fs.readdir(this.dir)).filter((n) => n.toLowerCase().endsWith('.json')).sort((a, b) => a.localeCompare(b))
    const result: ServerPreset[] = []
    for (const name of names) {
      try {
        const parsed = JSON.parse(await fs.readFile(join(this.dir, name), 'utf8')) as Partial<ServerPreset>
        if (typeof parsed.name === 'string' && parsed.name.trim()) result.push({ ...defaultPreset(parsed.name), ...parsed } as ServerPreset)
      } catch {
        continue
      }
    }
    return result
  }

  async save(preset: ServerPreset, previousName: string | null = null): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    if (previousName && previousName.toLowerCase() !== preset.name.toLowerCase()) await this.remove(previousName)
    const target = this.fileFor(preset.name)
    const temp = `${target}.tmp`
    await fs.writeFile(temp, JSON.stringify(preset, null, 2), 'utf8')
    await fs.rename(temp, target)
  }

  async remove(name: string): Promise<void> {
    await fs.rm(this.fileFor(name), { force: true })
  }

  async importLegacy(folder: string): Promise<number> {
    let source = join(folder, 'presets')
    try {
      await fs.access(source)
    } catch {
      source = folder
    }
    const existing = new Set((await this.list()).map((p) => p.name.toLowerCase()))
    let imported = 0
    for (const file of await fs.readdir(source)) {
      if (!file.toLowerCase().endsWith('.preset')) continue
      try {
        const text = await fs.readFile(join(source, file), 'utf8')
        const preset = parseLegacyPreset(text.split(/\r?\n/))
        if (preset && !existing.has(preset.name.toLowerCase())) {
          await this.save(preset)
          existing.add(preset.name.toLowerCase())
          imported++
        }
      } catch {
        continue
      }
    }
    return imported
  }
}
