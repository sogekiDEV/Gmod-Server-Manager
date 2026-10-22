import { useState, type ReactNode } from 'react'
import { buildArgs, getArg, isFlag, parseArgs, quoteArg, removeArg, setArg, unquote, type ArgEntry } from '@shared/argline'
import type { ServerPreset } from '@shared/types'
import { updatePreset } from '../actions'
import { CATALOG, TOGGLES, isKnownArg, toggleIsOn, type ArgItem } from '../argCatalog'
import { useT } from '../store'
import { Button, Card, Field, Switch } from './ui'

function ItemField(props: { item: ArgItem; entries: ArgEntry[]; commit: (entries: ArgEntry[]) => void }): ReactNode {
  const t = useT()
  const { item, entries, commit } = props

  const value = unquote(getArg(entries, item.key) ?? '')
  const change = (raw: string): void => {
    const next = item.kind === 'number' ? raw.replace(/\D/g, '') : raw
    commit(next === '' ? removeArg(entries, item.key) : setArg(entries, item.key, quoteArg(next)))
  }

  return (
    <Field label={t(item.label)} info={item.hint ? t(item.hint) : undefined}>
      <input
        className={`input ${item.kind === 'number' ? 'mono' : ''}`}
        dir="ltr"
        inputMode={item.kind === 'number' ? 'numeric' : undefined}
        value={value}
        placeholder={item.placeholder}
        onChange={(e) => change(e.target.value)}
      />
    </Field>
  )
}

function OtherArguments(props: { entries: ArgEntry[]; commit: (entries: ArgEntry[]) => void }): ReactNode {
  const t = useT()
  const { entries, commit } = props
  const [adding, setAdding] = useState(false)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  const others = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => !isKnownArg(entry.key))
  const valid = isFlag(key.trim()) && key.trim().length > 1 && !/\s/.test(key.trim())

  const replaceAt = (index: number, patch: Partial<ArgEntry>): void => {
    const next = entries.slice()
    next[index] = { ...next[index], ...patch }
    commit(next)
  }

  const add = (): void => {
    if (!valid) return
    commit([...entries, { key: key.trim(), value: quoteArg(value.trim()) }])
    setKey('')
    setValue('')
    setAdding(false)
  }

  return (
    <div className="sub-section">
      <h4 className="sub-head">{t('cat_other')}</h4>
      {others.map(({ entry, index }) => (
        <div className="kv" key={index}>
          <input className="input mono" dir="ltr" value={entry.key} onChange={(e) => replaceAt(index, { key: e.target.value.replace(/\s/g, '') })} />
          <input className="input mono" dir="ltr" value={unquote(entry.value)} placeholder={t('other_value_ph')} onChange={(e) => replaceAt(index, { value: quoteArg(e.target.value) })} />
          <Button variant="quiet" onClick={() => commit(entries.filter((_, i) => i !== index))} aria-label="remove">
            ✕
          </Button>
        </div>
      ))}
      {adding ? (
        <>
          <div className="kv">
            <input className="input mono" dir="ltr" autoFocus value={key} placeholder={t('other_key_ph')} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <input className="input mono" dir="ltr" value={value} placeholder={t('other_value_ph')} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <Button variant="primary" onClick={add} disabled={!valid}>
              {t('other_confirm')}
            </Button>
          </div>
          {key.length > 0 && !valid ? <small>{t('other_invalid')}</small> : null}
        </>
      ) : (
        <div>
          <Button variant="quiet" onClick={() => setAdding(true)}>
            ＋ {t('other_add')}
          </Button>
        </div>
      )}
    </div>
  )
}

function useEditor(preset: ServerPreset): { entries: ArgEntry[]; commit: (next: ArgEntry[]) => void } {
  return { entries: parseArgs(preset.arguments), commit: (next) => updatePreset({ arguments: buildArgs(next) }) }
}

export function PrimaryArguments({ preset }: { preset: ServerPreset }): ReactNode {
  const t = useT()
  const { entries, commit } = useEditor(preset)
  return (
    <Card title={t('cat_server')}>
      <div className="grid">
        {CATALOG.map((item) => (
          <ItemField key={item.key} item={item} entries={entries} commit={commit} />
        ))}
      </div>
      <div className="toggles">
        {TOGGLES.map((item) => (
          <Switch
            key={item.key}
            checked={toggleIsOn(entries, item)}
            label={t(item.label)}
            info={t(item.hint)}
            onChange={(on) => commit(on ? setArg(entries, item.key, item.write) : removeArg(entries, item.key))}
          />
        ))}
      </div>
    </Card>
  )
}

export function AdvancedArguments({ preset }: { preset: ServerPreset }): ReactNode {
  const { entries, commit } = useEditor(preset)
  return <OtherArguments entries={entries} commit={commit} />
}
