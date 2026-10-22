import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { isAbsolute, join, relative, resolve } from 'path'

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.lstat(path)
    return true
  } catch {
    return false
  }
}

export interface Size {
  bytes: number
  files: number
}

export async function measure(path: string): Promise<Size> {
  const stat = await fs.lstat(path)
  if (stat.isSymbolicLink()) return { bytes: 0, files: 0 }
  if (!stat.isDirectory()) return { bytes: stat.size, files: 1 }
  let bytes = 0
  let files = 0
  for (const entry of await fs.readdir(path, { withFileTypes: true })) {
    const child = await measure(join(path, entry.name))
    bytes += child.bytes
    files += child.files
  }
  return { bytes, files }
}

export function isInside(root: string, child: string): boolean {
  const rel = relative(resolve(root), resolve(child))
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
}

export async function removePath(path: string): Promise<void> {
  const stat = await fs.lstat(path)
  if (stat.isSymbolicLink()) {
    try {
      await fs.unlink(path)
    } catch {
      await fs.rmdir(path)
    }
    return
  }
  await fs.rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}

export function stamp(date: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
}

export function zipPaths(paths: string[], destination: string): Promise<void> {
  const script = '$p = $env:SM_PATHS | ConvertFrom-Json; Compress-Archive -LiteralPath $p -DestinationPath $env:SM_DEST -Force'
  return new Promise((resolvePromise, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { env: { ...process.env, SM_PATHS: JSON.stringify(paths), SM_DEST: destination }, windowsHide: true },
      (error) => (error ? reject(error) : resolvePromise())
    )
  })
}
