import logo from '../assets/logo.png'
import type { ReactNode } from 'react'
import { createPreset, selectPreset, setLang } from '../actions'
import { folderLabel } from '../format'
import { LANGUAGES } from '../i18n'
import { useStore, useT } from '../store'
import { Button, Segmented } from './ui'

export function Sidebar(): ReactNode {
  const t = useT()
  const presets = useStore((s) => s.presets)
  const selected = useStore((s) => s.selected)
  const state = useStore((s) => s.status.state)
  const lang = useStore((s) => s.lang)

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="logo" src={logo} alt="" draggable={false} />
        <div className="brand-text">
          <strong>{t('app_name')}</strong>
          <small>Garry&apos;s Mod</small>
        </div>
      </div>

      <div className="side-head">{t('presets')}</div>
      <div className="preset-list">
        {presets.length === 0 ? (
          <p className="muted pad">{t('no_presets')}</p>
        ) : (
          presets.map((p) => (
            <button key={p.name} className={`preset ${p.name === selected ? 'on' : ''}`} onClick={() => void selectPreset(p.name)}>
              <span className={`dot ${p.name === selected ? state : 'stopped'}`} />
              <span className="preset-text">
                <span className="preset-name">{p.name || '—'}</span>
                <small dir="ltr">{p.serverFolder ? folderLabel(p.serverFolder) : t('no_folder_set')}</small>
              </span>
            </button>
          ))
        )}
      </div>

      <div className="side-actions">
        <Button variant="primary" onClick={() => void createPreset()}>
          ＋ {t('new_preset')}
        </Button>
      </div>

      <div className="side-foot">
        <Segmented value={lang} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} onChange={setLang} />
      </div>
    </aside>
  )
}
