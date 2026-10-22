import { createRoot } from 'react-dom/client'
import { App } from './App'
import { boot } from './actions'
import { loadDemo } from './demo'
import './styles.css'

const params = new URLSearchParams(window.location.search)

if (params.has('demo')) loadDemo(params)
else void boot()

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
