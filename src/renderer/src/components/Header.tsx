import { useEffect, useState, type ReactNode } from 'react'
import { restartServer, startServer, stopServer } from '../actions'
import { formatUptime } from '../format'
import { selectedPreset, useStore, useT } from '../store'
import { Button } from './ui'

export function Header(): ReactNode {
  const t = useT()
  const preset = useStore(selectedPreset)
  const status = useStore((s) => s.status)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  if (!preset) return <header className="header" />

  const running = status.state !== 'stopped'
  const info = status.info
  const uptime = status.startedAt ? formatUptime(now - status.startedAt) : t('uptime_unknown')
  const canStart = Boolean(preset.serverFolder.trim())

  return (
    <header className="header">
      <div className="header-main">
        <div className="title-row">
          <h1>{preset.name}</h1>
          <span className={`pill ${status.state}`}>
            <i />
            {t(status.state === 'stopped' ? 'state_stopped' : status.state === 'starting' ? 'state_starting' : 'state_running')}
          </span>
          {status.external && running ? <span className="tag">{t('external_note')}</span> : null}
        </div>
        <div className="subtitle" dir="ltr">
          {preset.serverFolder || t('no_folder_set')}
        </div>
      </div>

      <div className="stats">
        <div>
          <label>{t('stat_map')}</label>
          <strong dir="ltr">{info?.map ?? '—'}</strong>
        </div>
        <div>
          <label>{t('stat_players')}</label>
          <strong>{info ? `${info.players}/${info.maxPlayers}` : '—'}</strong>
        </div>
        <div>
          <label>{t('stat_uptime')}</label>
          <strong>{running ? uptime : '—'}</strong>
        </div>
      </div>

      <div className="header-actions">
        {running ? (
          <>
            <Button onClick={() => void run(restartServer)} disabled={busy}>
              {t('restart')}
            </Button>
            <Button variant="danger" onClick={() => void run(stopServer)} disabled={busy}>
              {t('stop')}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => void run(startServer)} disabled={busy || !canStart}>
            {t('start')}
          </Button>
        )}
      </div>
    </header>
  )
}
