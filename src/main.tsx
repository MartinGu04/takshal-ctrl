import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { retireServiceWorkers } from './lib/retireServiceWorker'
import './styles/global.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The portal ships no service worker; remove the push worker earlier versions registered.
retireServiceWorkers().catch(() => undefined)
