import { useState, type ReactNode } from 'react'
import { buildArgs, serverLaunchEntries } from '@shared/argline'
import { deleteSelectedPreset, pickServerFolder, updatePreset } from '../actions'
import { selectedPreset, useStore, useT } from '../store'
import { AdvancedArguments, PrimaryArguments } from './ArgumentsEditor'
import { Banner, Button, Card, Field, Modal } from './ui'

export function SettingsView(): ReactNode {
  const t = useT()
  const preset = useStore(selectedPreset)
  const [confirm, setConfirm] = useState(false)
  if (!preset) return null

  const preview = `srcds.exe ${buildArgs(serverLaunchEntries(preset.arguments), true)}`

  return (
    <div className="scroll">
      <Card>
        <div className="grid">
          <Field label={t('settings_name')}>
            <input className="input" value={preset.name} onChange={(e) => updatePreset({ name: e.target.value })} />
          </Field>
          <Field label={t('settings_folder')}>
            <div className="inline">
              <input className="input mono" dir="ltr" value={preset.serverFolder} onChange={(e) => updatePreset({ serverFolder: e.target.value })} />
              <Button onClick={() => void pickServerFolder()}>{t('browse')}</Button>
            </div>
          </Field>
        </div>
      </Card>

      <PrimaryArguments preset={preset} />

      <details className="more">
        <summary>{t('more_options')}</summary>
        <div className="more-body">
          <AdvancedArguments preset={preset} />
          <div className="sub-section">
            <h4 className="sub-head">{t('settings_preview')}</h4>
            <pre className="preview" dir="ltr">
              {preview}
            </pre>
            <Banner kind="info">{t('condebug_note')}</Banner>
            <details className="more inner">
              <summary>{t('raw_toggle')}</summary>
              <div className="more-body">
                <Field label={t('settings_args')} hint={t('settings_args_hint')}>
                  <textarea className="input mono area" dir="ltr" rows={3} value={preset.arguments} onChange={(e) => updatePreset({ arguments: e.target.value })} />
                </Field>
              </div>
            </details>
          </div>
        </div>
      </details>

      <div className="foot-link">
        <Button variant="quiet" className="danger-text" onClick={() => setConfirm(true)}>
          {t('settings_delete')}
        </Button>
      </div>

      {confirm ? (
        <Modal
          title={t('settings_delete_title')}
          confirmLabel={t('confirm')}
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false)
            void deleteSelectedPreset()
          }}
        >
          {t('settings_delete_text', { name: preset.name })}
        </Modal>
      ) : null}
    </div>
  )
}
