import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CleanMode } from '@shared/types'
import { errorKey, scanCache, scanData } from '../actions'
import { formatBytes, formatDate } from '../format'
import { selectedPreset, useStore, useT } from '../store'
import { Banner, Button, Card, Modal } from './ui'

interface Outcome {
  ok: boolean
  text: string
  extra?: string
}

function OutcomeBanner({ outcome }: { outcome: Outcome | null }): ReactNode {
  if (!outcome) return null
  return (
    <Banner kind={outcome.ok ? 'ok' : 'error'}>
      <div>{outcome.text}</div>
      {outcome.extra ? (
        <small dir="ltr" className="break">
          {outcome.extra}
        </small>
      ) : null}
    </Banner>
  )
}

function Mini(props: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }): ReactNode {
  return (
    <div className={`mini ${props.tone ?? ''}`}>
      <label>{props.label}</label>
      <strong>{props.value}</strong>
      {props.sub ? <small>{props.sub}</small> : null}
    </div>
  )
}

function CacheCard({ running }: { running: boolean }): ReactNode {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const preset = useStore(selectedPreset)
  const cache = useStore((s) => s.cache)
  const busyScan = useStore((s) => s.cacheBusy)
  const [confirm, setConfirm] = useState<CleanMode | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const stale = useMemo(() => (cache ? cache.addons.filter((a) => a.inCollection === false) : []), [cache])
  const shown = stale.slice(0, 7)

  const run = async (mode: CleanMode): Promise<void> => {
    if (!preset) return
    setBusy(true)
    try {
      const result = await window.api.cleanupRunCache(preset, mode)
      setConfirm(null)
      if (result.ok) {
        setOutcome({
          ok: true,
          text: t('cache_done', { n: result.removedCount, size: formatBytes(result.freedBytes, lang) }),
          extra: result.backupPath ? t('cache_done_backup', { path: result.backupPath }) : undefined
        })
      } else {
        setOutcome({ ok: false, text: t(errorKey(result.error)), extra: result.detail })
      }
      await scanCache()
    } finally {
      setBusy(false)
    }
  }

  const collectionLine = (): ReactNode => {
    if (!cache) return null
    if (cache.collectionStatus === 'ok') return <Banner kind="info">{t('cache_collection_ok', { id: cache.collectionId ?? '', n: cache.collectionCount })}</Banner>
    if (cache.collectionStatus === 'no_collection') return <Banner kind="warn">{t('cache_collection_none')}</Banner>
    return <Banner kind="warn">{t('cache_collection_unavailable')}</Banner>
  }

  const canClean = Boolean(cache) && !running && !busy && cache?.collectionStatus === 'ok' && stale.length > 0
  const canClearAll = Boolean(cache) && !running && !busy && (cache?.addons.length ?? 0) > 0

  return (
    <Card
      title={t('cache_title')}
      subtitle={t('cache_desc')}
      actions={
        <Button variant="quiet" onClick={() => void scanCache()} disabled={busyScan}>
          {busyScan ? t('working') : t('cleanup_rescan')}
        </Button>
      }
    >
      {!cache ? null : !cache.folderExists ? (
        <Banner kind="info">{t('cache_no_folder')}</Banner>
      ) : (
        <>
          {collectionLine()}
          <div className="minis">
            <Mini label={t('cache_total')} value={formatBytes(cache.totalBytes, lang)} sub={`${cache.addons.length}`} />
            <Mini label={t('cache_keep')} value={formatBytes(cache.keepBytes, lang)} sub={`${cache.keepCount}`} tone="ok" />
            <Mini label={t('cache_stale')} value={formatBytes(cache.staleBytes, lang)} sub={`${cache.staleCount}`} tone="warn" />
          </div>

          {cache.collectionStatus === 'ok' && stale.length === 0 ? <Banner kind="ok">{t('cache_nothing_stale')}</Banner> : null}

          {stale.length > 0 ? (
            <div className="table">
              <div className="table-title">{t('cache_stale_list')}</div>
              {shown.map((a) => (
                <div className="trow" key={a.id}>
                  <button className="link" dir="ltr" onClick={() => void window.api.openExternal(`https://steamcommunity.com/sharedfiles/filedetails/?id=${a.id}`)}>
                    {a.id}
                  </button>
                  <span className="muted">{formatDate(a.modified, lang)}</span>
                  <strong>{formatBytes(a.bytes, lang)}</strong>
                </div>
              ))}
              {stale.length > shown.length ? <div className="trow more">{t('cache_more', { n: stale.length - shown.length })}</div> : null}
            </div>
          ) : null}

          <OutcomeBanner outcome={outcome} />

          <div className="card-foot">
            <Button variant="primary" disabled={!canClean} onClick={() => setConfirm('stale')}>
              {t('cache_clean_stale', { size: formatBytes(cache.staleBytes, lang) })}
            </Button>
            <details className="advanced">
              <summary>{t('cache_advanced')}</summary>
              <Button variant="danger" disabled={!canClearAll} onClick={() => setConfirm('all')}>
                {t('cache_clear_all')}
              </Button>
            </details>
          </div>
        </>
      )}

      {confirm === 'stale' && cache ? (
        <Modal
          title={t('cache_confirm_stale_title')}
          confirmLabel={t('confirm')}
          danger
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run('stale')}
        >
          {t('cache_confirm_stale_text', { n: cache.staleCount, size: formatBytes(cache.staleBytes, lang), keep: cache.keepCount })}
        </Modal>
      ) : null}
      {confirm === 'all' && cache ? (
        <Modal
          title={t('cache_confirm_all_title')}
          confirmLabel={t('confirm')}
          danger
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run('all')}
        >
          {t('cache_confirm_all_text', { n: cache.addons.length, size: formatBytes(cache.totalBytes, lang) })}
        </Modal>
      ) : null}
    </Card>
  )
}

function DataCard({ running }: { running: boolean }): ReactNode {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const preset = useStore(selectedPreset)
  const data = useStore((s) => s.data)
  const busyScan = useStore((s) => s.dataBusy)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [svdb, setSvdb] = useState(false)
  const [backup, setBackup] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const selectedBytes = useMemo(() => {
    if (!data) return 0
    let sum = data.entries.filter((e) => picked.has(e.name)).reduce((acc, e) => acc + e.bytes, 0)
    if (svdb) sum += data.svDbBytes
    return sum
  }, [data, picked, svdb])
  const selectedCount = picked.size + (svdb ? 1 : 0)

  const toggle = (name: string): void => {
    const next = new Set(picked)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setPicked(next)
  }

  const run = async (): Promise<void> => {
    if (!preset) return
    setBusy(true)
    try {
      const result = await window.api.cleanupRunData(preset, [...picked], svdb, backup)
      setConfirm(false)
      if (result.ok) {
        setOutcome({
          ok: true,
          text: t('data_done', { n: result.deleted.length, size: formatBytes(result.freedBytes, lang) }),
          extra: result.backupPath ? t('data_done_backup', { path: result.backupPath }) : undefined
        })
        setPicked(new Set())
        setSvdb(false)
      } else {
        setOutcome({ ok: false, text: t(errorKey(result.error)), extra: result.detail })
      }
      await scanData()
    } finally {
      setBusy(false)
    }
  }

  const openBackups = async (): Promise<void> => {
    const info = await window.api.appInfo()
    await window.api.openPath(`${info.dataDir}\\backups`)
  }

  return (
    <Card
      title={t('data_title')}
      subtitle={t('data_desc')}
      actions={
        <>
          <Button variant="quiet" onClick={() => void openBackups()}>
            {t('open_backups')}
          </Button>
          <Button variant="quiet" onClick={() => void scanData()} disabled={busyScan}>
            {busyScan ? t('working') : t('cleanup_rescan')}
          </Button>
        </>
      }
    >
      {!data ? null : (
        <>
          <div className="list">
            {data.entries.length === 0 && !data.svDbExists ? <p className="muted pad">{t('data_empty')}</p> : null}
            {data.entries.map((e) => (
              <label key={e.name} className="lrow">
                <input type="checkbox" checked={picked.has(e.name)} onChange={() => toggle(e.name)} />
                <span className="lname" dir="ltr">
                  {e.isDir ? '▸ ' : ''}
                  {e.name}
                </span>
                <span className="muted">{formatBytes(e.bytes, lang)}</span>
              </label>
            ))}
            {data.svDbExists ? (
              <label className="lrow">
                <input type="checkbox" checked={svdb} onChange={(e) => setSvdb(e.target.checked)} />
                <span className="lname" dir="ltr">
                  {t('data_svdb')}
                </span>
                <span className="muted">{formatBytes(data.svDbBytes, lang)}</span>
              </label>
            ) : null}
          </div>

          <OutcomeBanner outcome={outcome} />

          <div className="card-foot wrap">
            <div className="inline">
              <Button variant="quiet" onClick={() => setPicked(new Set(data.entries.map((e) => e.name)))}>
                {t('data_select_all')}
              </Button>
              <Button variant="quiet" onClick={() => { setPicked(new Set()); setSvdb(false) }}>
                {t('data_select_none')}
              </Button>
            </div>
            <label className="check">
              <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
              {t('data_backup')}
            </label>
            <div className="spacer" />
            <span className="muted">{t('data_selected', { n: selectedCount, size: formatBytes(selectedBytes, lang) })}</span>
            <Button variant="danger" disabled={running || busy || selectedCount === 0} onClick={() => setConfirm(true)}>
              {t('data_delete')}
            </Button>
          </div>
        </>
      )}

      {confirm ? (
        <Modal title={t('data_confirm_title')} confirmLabel={t('confirm')} danger busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void run()}>
          {t('data_confirm_text', {
            n: selectedCount,
            size: formatBytes(selectedBytes, lang),
            backup: backup ? t('data_confirm_backup') : t('data_confirm_nobackup')
          })}
        </Modal>
      ) : null}
    </Card>
  )
}

export function CleanupView(): ReactNode {
  const t = useT()
  const preset = useStore(selectedPreset)
  const running = useStore((s) => s.status.state !== 'stopped')
  const folder = preset?.serverFolder ?? ''

  useEffect(() => {
    void scanCache()
    void scanData()
  }, [preset?.name, folder, preset?.arguments, running])

  if (!preset) return null

  return (
    <div className="scroll">
      {!folder.trim() ? <Banner kind="warn">{t('cleanup_need_folder')}</Banner> : null}
      {running ? <Banner kind="warn">{t('cleanup_stop_first')}</Banner> : null}
      <CacheCard running={running} />
      <DataCard running={running} />
    </div>
  )
}
