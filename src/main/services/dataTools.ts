import { promises as fs } from 'fs'
import { join } from 'path'
import type { CleanErrorCode, DataCleanResult, DataEntry, DataReport } from '@shared/types'
import { exists, measure, removePath, stamp, zipPaths } from './fsUtil'

const SV_DB_FILES = ['sv.db', 'sv.db-journal', 'sv.db-wal', 'sv.db-shm']

export function dataPaths(serverFolder: string): { gm: string; data: string } {
  const gm = join(serverFolder, 'garrysmod')
  return { gm, data: join(gm, 'data') }
}

export async function scanData(serverFolder: string): Promise<DataReport> {
  const paths = dataPaths(serverFolder)
  const report: DataReport = { folderExists: await exists(paths.data), entries: [], svDbExists: false, svDbBytes: 0 }
  if (report.folderExists) {
    for (const entry of await fs.readdir(paths.data, { withFileTypes: true })) {
      const size = await measure(join(paths.data, entry.name))
      const item: DataEntry = { name: entry.name, isDir: entry.isDirectory(), bytes: size.bytes, files: size.files }
      report.entries.push(item)
    }
    report.entries.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
  }
  for (const name of SV_DB_FILES) {
    const file = join(paths.gm, name)
    if (await exists(file)) {
      report.svDbExists = true
      report.svDbBytes += (await fs.stat(file)).size
    }
  }
  return report
}

export interface DataCleanOptions {
  serverFolder: string
  names: string[]
  includeSvDb: boolean
  backup: boolean
  backupDir: string
  isServerRunning: () => Promise<boolean>
  now?: () => Date
}

class DataError extends Error {
  constructor(
    public readonly code: CleanErrorCode,
    public readonly detail?: string
  ) {
    super(code)
  }
}

async function execute(options: DataCleanOptions): Promise<DataCleanResult> {
  if (!options.serverFolder.trim()) throw new DataError('no_server_folder')
  if (await options.isServerRunning()) throw new DataError('server_running')
  if (options.names.length === 0 && !options.includeSvDb) throw new DataError('nothing_selected')

  const paths = dataPaths(options.serverFolder)
  const targets: string[] = []
  if (options.names.length > 0) {
    const real = new Set(await fs.readdir(paths.data))
    for (const name of options.names) {
      if (name.includes('/') || name.includes('\\') || name === '.' || name === '..' || !real.has(name)) throw new DataError('unsafe_path', name)
      targets.push(join(paths.data, name))
    }
  }
  if (options.includeSvDb) {
    for (const name of SV_DB_FILES) {
      const file = join(paths.gm, name)
      if (await exists(file)) targets.push(file)
    }
  }

  const result: DataCleanResult = { ok: true, deleted: [], freedBytes: 0, backupPath: null }
  if (targets.length === 0) return result

  if (options.backup) {
    try {
      await fs.mkdir(options.backupDir, { recursive: true })
      const zip = join(options.backupDir, `data-backup-${stamp((options.now ?? (() => new Date()))())}.zip`)
      await zipPaths(targets, zip)
      if ((await fs.stat(zip)).size === 0) throw new Error('empty archive')
      result.backupPath = zip
    } catch (error) {
      throw new DataError('backup_failed', (error as Error).message)
    }
  }

  for (const target of targets) {
    const size = await measure(target)
    await removePath(target)
    result.deleted.push(target.slice(paths.gm.length + 1))
    result.freedBytes += size.bytes
  }
  return result
}

export async function runDataClean(options: DataCleanOptions): Promise<DataCleanResult> {
  const failure: DataCleanResult = { ok: false, deleted: [], freedBytes: 0, backupPath: null }
  try {
    return await execute(options)
  } catch (error) {
    if (error instanceof DataError) return { ...failure, error: error.code, detail: error.detail }
    return { ...failure, error: 'unknown', detail: (error as Error).message }
  }
}
