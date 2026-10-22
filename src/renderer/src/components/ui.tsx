import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useT } from '../store'

type Variant = 'primary' | 'ghost' | 'danger' | 'quiet'

export function Button({ variant = 'ghost', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): ReactNode {
  return <button {...props} className={`btn btn-${variant} ${className}`} />
}

const TIP_WIDTH = 280
const TIP_MARGIN = 12

export function Info({ text }: { text: string }): ReactNode {
  const [tip, setTip] = useState<{ left: number; top: number; below: boolean } | null>(null)

  const show = (target: HTMLElement): void => {
    const rect = target.getBoundingClientRect()
    const width = Math.min(TIP_WIDTH, window.innerWidth - TIP_MARGIN * 2)
    const left = Math.min(Math.max(TIP_MARGIN, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - TIP_MARGIN)
    const below = rect.top < 130
    setTip({ left, top: below ? rect.bottom + 8 : rect.top - 8, below })
  }

  return (
    <i
      className="info"
      tabIndex={0}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setTip(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setTip(null)}
      onClick={(e) => e.preventDefault()}
    >
      i
      {tip ? (
        <span className={`tip ${tip.below ? 'below' : ''}`} style={{ left: tip.left, top: tip.top, width: Math.min(TIP_WIDTH, window.innerWidth - TIP_MARGIN * 2) }}>
          {text}
        </span>
      ) : null}
    </i>
  )
}

export function Switch(props: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string; info?: string; disabled?: boolean }): ReactNode {
  return (
    <label className={`switch ${props.disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="track">
        <span className="thumb" />
      </span>
      <span className="switch-text">
        <span>
          {props.label}
          {props.info ? <Info text={props.info} /> : null}
        </span>
        {props.hint ? <small>{props.hint}</small> : null}
      </span>
    </label>
  )
}

export function Card(props: { title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode; className?: string }): ReactNode {
  return (
    <section className={`card ${props.className ?? ''}`}>
      {props.title ? (
        <header className="card-head">
          <div>
            <h3>{props.title}</h3>
            {props.subtitle ? <p>{props.subtitle}</p> : null}
          </div>
          {props.actions ? <div className="card-actions">{props.actions}</div> : null}
        </header>
      ) : null}
      {props.children}
    </section>
  )
}

export function Segmented<T extends string>(props: { value: T; options: Array<{ value: T; label: string; badge?: string }>; onChange: (value: T) => void }): ReactNode {
  return (
    <div className="segmented">
      {props.options.map((o) => (
        <button key={o.value} className={props.value === o.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
          {o.badge ? <em>{o.badge}</em> : null}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string>(props: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }): ReactNode {
  return (
    <div className="chips">
      {props.options.map((o) => (
        <button key={o.value} className={props.value === o.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Banner(props: { kind: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }): ReactNode {
  return <div className={`banner banner-${props.kind}`}>{props.children}</div>
}

export function Modal(props: { title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }): ReactNode {
  const t = useT()
  return (
    <div className="modal-backdrop" onClick={props.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{props.title}</h3>
        <div className="modal-body">{props.children}</div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={props.onCancel} disabled={props.busy}>
            {t('cancel')}
          </Button>
          <Button variant={props.danger ? 'danger' : 'primary'} onClick={props.onConfirm} disabled={props.busy}>
            {props.busy ? t('working') : props.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Field(props: { label: string; hint?: string; info?: string; children: ReactNode; className?: string }): ReactNode {
  return (
    <label className={`field ${props.className ?? ''}`}>
      <span className="field-label">
        {props.label}
        {props.info ? <Info text={props.info} /> : null}
      </span>
      {props.children}
      {props.hint ? <small>{props.hint}</small> : null}
    </label>
  )
}
