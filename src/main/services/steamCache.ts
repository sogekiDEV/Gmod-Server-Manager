import { promises as fs } from 'fs'
import { basename, join } from 'path'
import type { CleanErrorCode, CleanMode, CleanResult, SteamCacheReport } from '@shared/types'
import { extractCollectionId } from '@shared/argline'
import { fetchCollectionIds, type CollectionFetcher } from './collection'
import { listAcfIds, removeAcfEntries, validateAcf } from './acf'
import { exists, isInside, measure, removePath, stamp } from './fsUtil'

const ID = /^\d+$/

export class CleanError extends Error {
  constructor(
    public readonly code: CleanErrorCode,
    public readonly detail?: string
  ) {
    super(code)
  }
}

export interface CachePaths {
  root: string
  content: string
  acf: string
  legacy: string
}

export function cachePaths(serverFolder: string): CachePaths {
  const root = join(serverFolder, 'steam_cache')
  return {
    root,
    content: join(root, 'content', '4000'),
    acf: join(root, 'appworkshop_4000.acf'),
    legacy: join(serverFolder, 'garrysmod', 'cache', 'srcds')
  }
}

export interface ScannedAddon {
  id: string
  path: string
  bytes: number
  files: number
  modified: number
}

export interface CacheScan {
  folderExists: boolean
  acfExists: boolean
  addons: ScannedAddon[]
  unknownFolders: string[]
  legacyFiles: string[]
  legacyBytes: number
}

export async function scanCache(serverFolder: string): Promise<CacheScan> {
  const paths = cachePaths(serverFolder)
  const scan: CacheScan = {
    folderExists: await exists(paths.root),
    acfExists: await exists(paths.acf),
    addons: [],
    unknownFolders: [],
    legacyFiles: [],
    legacyBytes: 0
  }

  if (await exists(paths.content)) {
    for (const entry of await fs.readdir(paths.content, { withFileTypes: true })) {
      if (!entry.isDirectory() || !ID.test(entry.name)) {
        scan.unknownFolders.push(entry.name)
        continue
      }
      const full = join(paths.content, entry.name)
      const size = await measure(full)
      const stat = await fs.lstat(full)
      scan.addons.push({ id: entry.name, path: full, bytes: size.bytes, files: size.files, modified: stat.mtimeMs })
    }
    scan.addons.sort((a, b) => b.bytes - a.bytes)
  }

  if (await exists(paths.legacy)) {
    for (const entry of await fs.readdir(paths.legacy, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.gma')) {
        const full = join(paths.legacy, entry.name)
        scan.legacyFiles.push(full)
        scan.legacyBytes += (await fs.stat(full)).size
      }
    }
  }
  return scan
}

export async function buildCacheReport(
  serverFolder: string,
  argsText: string,
  fetcher: CollectionFetcher = (id) => fetchCollectionIds(id)
): Promise<SteamCacheReport> {
  const scan = await scanCache(serverFolder)
  const collectionId = extractCollectionId(argsText)
  let collection: Set<string> | null = null
  let status: SteamCacheReport['collectionStatus'] = 'no_collection'

  if (collectionId) {
    try {
      collection = await fetcher(collectionId)
      status = collection.size > 0 ? 'ok' : 'unavailable'
      if (collection.size === 0) collection = null
    } catch {
      status = 'unavailable'
      collection = null
    }
  }

  const addons = scan.addons.map((a) => ({
    id: a.id,
    bytes: a.bytes,
    files: a.files,
    modified: a.modified,
    inCollection: collection ? collection.has(a.id) : null
  }))
  const stale = addons.filter((a) => a.inCollection === false)
  const keep = addons.filter((a) => a.inCollection === true)

  return {
    folderExists: scan.folderExists,
    acfExists: scan.acfExists,
    collectionId,
    collectionStatus: status,
    collectionCount: collection?.size ?? 0,
    addons,
    totalBytes: addons.reduce((sum, a) => sum + a.bytes, 0),
    staleCount: stale.length,
    staleBytes: stale.reduce((sum, a) => sum + a.bytes, 0),
    keepCount: keep.length,
    keepBytes: keep.reduce((sum, a) => sum + a.bytes, 0),
    unknownFolders: scan.unknownFolders,
    legacyBytes: scan.legacyBytes
  }
}

export interface CleanPlan {
  remove: ScannedAddon[]
  keep: ScannedAddon[]
}

export function planClean(scan: CacheScan, mode: CleanMode, collection: Set<string> | null): CleanPlan {
  if (mode === 'all') return { remove: scan.addons.slice(), keep: [] }
  if (!collection) throw new CleanError('collection_unavailable')
  if (collection.size === 0) throw new CleanError('collection_empty')
  const remove = scan.addons.filter((a) => !collection.has(a.id))
  const keep = scan.addons.filter((a) => collection.has(a.id))
  if (scan.addons.length > 0 && remove.length === scan.addons.length) throw new CleanError('would_remove_everything')
  return { remove, keep }
}

export interface CleanOptions {
  serverFolder: string
  argsText: string
  mode: CleanMode
  backupDir: string
  isServerRunning: () => Promise<boolean>
  fetcher?: CollectionFetcher
  now?: () => Date
}

async function loadCollection(argsText: string, fetcher: CollectionFetcher): Promise<Set<string>> {
  const id = extractCollectionId(argsText)
  if (!id) throw new CleanError('no_collection')
  let ids: Set<string>
  try {
    ids = await fetcher(id)
  } catch (error) {
    throw new CleanError('collection_unavailable', (error as Error).message)
  }
  if (ids.size === 0) throw new CleanError('collection_empty')
  return ids
}

async function assertSafe(paths: CachePaths, addon: ScannedAddon): Promise<void> {
  const stat = await fs.lstat(addon.path)
  const safe = ID.test(basename(addon.path)) && isInside(paths.content, addon.path) && !stat.isSymbolicLink() && stat.isDirectory()
  if (!safe) throw new CleanError('unsafe_path', addon.path)
}

async function execute(options: CleanOptions): Promise<CleanResult> {
  if (!options.serverFolder.trim()) throw new CleanError('no_server_folder')
  if (await options.isServerRunning()) throw new CleanError('server_running')

  const paths = cachePaths(options.serverFolder)
  const scan = await scanCache(options.serverFolder)
  const result: CleanResult = { ok: true, removedCount: 0, freedBytes: 0, remainingCount: scan.addons.length, backupPath: null, failed: [] }
  if (!scan.folderExists) return result

  const collection = options.mode === 'stale' ? await loadCollection(options.argsText, options.fetcher ?? ((id) => fetchCollectionIds(id))) : null
  const plan = planClean(scan, options.mode, collection)
  if (plan.remove.length === 0 && !(options.mode === 'all' && (scan.acfExists || scan.legacyFiles.length > 0))) return result

  for (const addon of plan.remove) await assertSafe(paths, addon)

  const ids = new Set(plan.remove.map((a) => a.id))

  if (scan.acfExists) {
    try {
      await fs.mkdir(options.backupDir, { recursive: true })
      const backup = join(options.backupDir, `appworkshop_4000.acf.${stamp((options.now ?? (() => new Date()))())}`)
      await fs.copyFile(paths.acf, backup)
      const original = await fs.stat(paths.acf)
      const copied = await fs.stat(backup)
      if (original.size !== copied.size) throw new Error('size mismatch')
      result.backupPath = backup
    } catch (error) {
      throw new CleanError('backup_failed', (error as Error).message)
    }

    if (options.mode === 'all') {
      await fs.rm(paths.acf, { force: true })
    } else {
      const text = await fs.readFile(paths.acf, 'utf8')
      const before = listAcfIds(text)
      const edited = removeAcfEntries(text, ids)
      const after = listAcfIds(edited.text)
      const keptStillThere = plan.keep.every((k) => !before.installed.includes(k.id) || after.installed.includes(k.id))
      const goneForGood = [...ids].every((id) => !after.installed.includes(id) && !after.details.includes(id))
      const countsMatch =
        after.installed.length === before.installed.length - edited.removed.installed &&
        after.details.length === before.details.length - edited.removed.details
      if (!validateAcf(edited.text) || !keptStillThere || !goneForGood || !countsMatch) throw new CleanError('acf_invalid')
      const temp = `${paths.acf}.tmp`
      await fs.writeFile(temp, edited.text, 'utf8')
      await fs.rename(temp, paths.acf)
    }
  }

  for (const addon of plan.remove) {
    try {
      await removePath(addon.path)
      result.removedCount++
      result.freedBytes += addon.bytes
    } catch {
      result.failed.push(addon.id)
    }
  }

  if (options.mode === 'all') {
    for (const file of scan.legacyFiles) {
      try {
        const size = (await fs.stat(file)).size
        await removePath(file)
        result.freedBytes += size
      } catch {
        result.failed.push(basename(file))
      }
    }
  }

  const after = await scanCache(options.serverFolder)
  result.remainingCount = after.addons.length
  if (options.mode === 'stale') {
    const expected = new Set([...plan.keep.map((k) => k.id), ...result.failed])
    const actual = new Set(after.addons.map((a) => a.id))
    const same = expected.size === actual.size && [...expected].every((id) => actual.has(id))
    if (!same) {
      result.ok = false
      result.error = 'verify_failed'
    }
  }
  if (result.failed.length > 0) {
    result.ok = false
    result.error = result.error ?? 'unknown'
    result.detail = result.failed.join(', ')
  }
  return result
}

export async function runClean(options: CleanOptions): Promise<CleanResult> {
  const failure: CleanResult = { ok: false, removedCount: 0, freedBytes: 0, remainingCount: 0, backupPath: null, failed: [] }
  try {
    return await execute(options)
  } catch (error) {
    if (error instanceof CleanError) return { ...failure, error: error.code, detail: error.detail }
    return { ...failure, error: 'unknown', detail: (error as Error).message }
  }
}
