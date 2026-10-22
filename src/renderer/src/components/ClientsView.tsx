import { useEffect, useState, type ReactNode } from 'react'
import { CLIENT_SIZES, clientSize, type DisplayInfo, type ScreenMode } from '@shared/types'
import { closeClient, focusClient, launchClients, pickClientExe, updatePreset } from '../actions'
import { selectedPreset, useStore, useT } from '../store'
import { Banner, Button, Card, Chips, Field, Segmented, Switch } from './ui'

const DEMO_DISPLAYS: DisplayInfo[] = [
  { index: 0, primary: true, width: 1920, height: 1080 },
  { index: 1, primary: false, width: 1920, height: 1080 }
]

const toInt = (value: string, fallback: number, min: number, max: number): number => {
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function ClientsView(): ReactNode {
  const t = useT()
  const preset = useStore(selectedPreset)
  const slots = useStore((s) => s.status.clientSlots)
  const clients = slots.length
  const demo = useStore((s) => s.demo)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const name = preset?.name
  const missingExe = preset ? !preset.clientExe.trim() : false

  useEffect(() => {
    if (demo) {
      setDisplays(DEMO_DISPLAYS)
      return
    }
    void window.api.clientsDisplays().then(setDisplays)
  }, [demo])

  useEffect(() => {
    if (!name || !missingExe || demo) return
    void window.api.clientsDetectExe().then((found) => {
      if (found) updatePreset({ clientExe: found })
    })
  }, [name, missingExe, demo])

  if (!preset) return null

  const missing = Array.from({ length: preset.clientCount }, (_, i) => i + 1).filter((n) => !slots.some((s) => s.slot === n)).length
  const [sizeW, sizeH] = clientSize(preset)

  const primaryIndex = Math.max(0, displays.findIndex((d) => d.primary))
  const chosenScreen = preset.screenIndex >= 0 && preset.screenIndex < displays.length ? preset.screenIndex : primaryIndex

  const chooseSize = (value: string): void => {
    const [width, height] = value.split('x').map(Number)
    updatePreset({ width, height })
  }

  return (
    <div className="scroll">
      <Card
        title={t('clients_title')}
        subtitle={t('clients_desc')}
        actions={<span className={`tag ${clients > 0 ? 'on' : ''}`}>{clients > 0 ? t('clients_running', { n: clients }) : t('clients_none_running')}</span>}
      >
        <div className="clients-main">
          <div className="field narrow">
            <span className="field-label">{t('clients_how_many')}</span>
            <div className="stepper">
              <Button onClick={() => updatePreset({ clientCount: Math.max(1, preset.clientCount - 1) })} disabled={preset.clientCount <= 1} aria-label="-">
                −
              </Button>
              <input className="input" type="number" min={1} max={16} value={preset.clientCount} onChange={(e) => updatePreset({ clientCount: toInt(e.target.value, 1, 1, 16) })} />
              <Button onClick={() => updatePreset({ clientCount: Math.min(16, preset.clientCount + 1) })} disabled={preset.clientCount >= 16} aria-label="+">
                +
              </Button>
            </div>
          </div>
          <Button variant="primary" onClick={() => void launchClients()} disabled={missingExe || missing === 0}>
            {missing === 0 ? t('clients_all_launched') : clients === 0 ? t('clients_launch_n', { n: missing }) : t('clients_launch_more', { n: missing })}
          </Button>
        </div>
        <small className="muted-line">{clients === 0 ? t('clients_hint_none') : missing === 0 ? t('clients_hint_full', { n: clients }) : t('clients_hint_add', { running: clients, total: preset.clientCount })}</small>
        {slots.length > 0 ? (
          <div className="client-list">
            {slots.map((s) => (
              <div className="client-row" key={s.slot}>
                <span className="badge-n">{s.slot}</span>
                <span className="grow">
                  <strong>{t('client_n', { n: s.slot })}</strong>
                  <small className={`state ${s.state}`}>{s.state === 'starting' ? t('client_starting') : t('client_running')}</small>
                </span>
                <Button variant="quiet" onClick={() => void focusClient(s.slot)} disabled={s.state === 'starting'}>
                  {t('client_show')}
                </Button>
                <Button variant="danger" onClick={() => void closeClient(s.slot)}>
                  {t('client_close')}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        {missingExe ? (
          <Banner kind="warn">
            <div className="inline">
              <span className="grow">{t('clients_exe_missing')}</span>
              <Button onClick={() => void pickClientExe()}>{t('browse')}</Button>
            </div>
          </Banner>
        ) : null}
      </Card>

      <Card>
        <div className="stack">
          {displays.length > 1 ? (
            <div className="field">
              <span className="field-label">{t('clients_screen')}</span>
              <Chips
                value={String(chosenScreen)}
                onChange={(value) => updatePreset({ screenIndex: Number(value) })}
                options={displays.map((d) => ({
                  value: String(d.index),
                  label: `${t('screen_n', { n: d.index + 1 })} · ${d.width} × ${d.height}${d.primary ? ` · ${t('screen_main')}` : ''}`
                }))}
              />
            </div>
          ) : null}

          <div className="field">
            <span className="field-label">{t('clients_size')}</span>
            <Chips
              value={`${sizeW}x${sizeH}`}
              onChange={chooseSize}
              options={CLIENT_SIZES.map(([w, h]) => ({
                value: `${w}x${h}`,
                label: `${w} × ${h}${w === CLIENT_SIZES[0][0] ? ` ${t('recommended')}` : ''}`
              }))}
            />
          </div>

          <div className="field">
            <span className="field-label">{t('clients_mode')}</span>
            <Segmented<ScreenMode>
              value={preset.screenMode}
              onChange={(screenMode) => updatePreset({ screenMode })}
              options={[
                { value: 'window', label: t('mode_window') },
                { value: 'noborder', label: t('mode_noborder') },
                { value: 'fullscreen', label: t('mode_fullscreen') }
              ]}
            />
            <small>{preset.screenMode === 'fullscreen' ? t('clients_fullscreen_note') : t('clients_layout_note')}</small>
          </div>
        </div>
      </Card>

      <details className="more">
        <summary>{t('more_options')}</summary>
        <div className="more-body">
          <Switch checked={preset.autoJoin} onChange={(autoJoin) => updatePreset({ autoJoin })} label={t('clients_autojoin')} hint={t('clients_autojoin_desc')} />
          <Field label={t('clients_exe')}>
            <div className="inline">
              <input className="input mono" dir="ltr" value={preset.clientExe} onChange={(e) => updatePreset({ clientExe: e.target.value })} />
              <Button onClick={() => void pickClientExe()}>{t('browse')}</Button>
            </div>
          </Field>
          <Field label={t('clients_args')}>
            <input className="input mono" dir="ltr" value={preset.clientArguments} onChange={(e) => updatePreset({ clientArguments: e.target.value })} />
          </Field>
        </div>
      </details>
    </div>
  )
}
