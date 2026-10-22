import { execFile } from 'child_process'
import { join } from 'path'
import { promises as fs } from 'fs'
import { exists } from './fsUtil'

export function parseLibraryPaths(vdf: string): string[] {
  const paths: string[] = []
  for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) paths.push(match[1].replace(/\\\\/g, '\\'))
  return paths
}

function readSteamPath(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      const match = /SteamPath\s+REG_SZ\s+(.+)/.exec(stdout)
      resolve(match ? match[1].trim().replace(/\//g, '\\') : null)
    })
  })
}

export async function findGmodClient(): Promise<string | null> {
  const roots = new Set<string>(['C:\\Program Files (x86)\\Steam'])
  const steam = await readSteamPath()
  if (steam) {
    roots.add(steam)
    try {
      const vdf = await fs.readFile(join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8')
      for (const library of parseLibraryPaths(vdf)) roots.add(library)
    } catch {
      roots.add(steam)
    }
  }
  for (const root of roots) {
    for (const exe of ['gmod.exe', 'hl2.exe']) {
      const candidate = join(root, 'steamapps', 'common', 'GarrysMod', exe)
      if (await exists(candidate)) return candidate
    }
  }
  return null
}
