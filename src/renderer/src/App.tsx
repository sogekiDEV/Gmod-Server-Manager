import logo from './assets/logo.png'
import type { ReactNode } from 'react'
import { ClientsView } from './components/ClientsView'
import { CleanupView } from './components/CleanupView'
import { Header } from './components/Header'
import { SettingsView } from './components/SettingsView'
import { Sidebar } from './components/Sidebar'
import { selectedPreset, setState, useStore, useT, type Tab } from './store'

export function App(): ReactNode {
  const t = useT()
  const tab = useStore((s) => s.tab)
  const preset = useStore(selectedPreset)
  const toast = useStore((s) => s.toast)

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'clients', label: t('tab_clients') },
    { id: 'cleanup', label: t('tab_cleanup') },
    { id: 'settings', label: t('tab_settings') }
  ]

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {preset ? (
          <>
            <Header />
            <nav className="tabs">
              {tabs.map((item) => (
                <button key={item.id} className={tab === item.id ? 'on' : ''} onClick={() => setState({ tab: item.id })}>
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="content">
              {tab === 'clients' ? <ClientsView /> : null}
              {tab === 'cleanup' ? <CleanupView /> : null}
              {tab === 'settings' ? <SettingsView /> : null}
            </div>
          </>
        ) : (
          <div className="empty-main">
            <img className="logo big" src={logo} alt="" draggable={false} />
            <h2>{t('app_name')}</h2>
            <p>{t('no_presets')}</p>
          </div>
        )}
      </main>
      {toast ? <div className={`toast toast-${toast.kind}`}>{toast.text}</div> : null}
    </div>
  )
}
