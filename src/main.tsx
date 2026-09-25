import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { registerServiceWorker } from './features/notifications/pushClient'
import './styles/global.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the push service worker once the page is idle. This never asks for permission;
// that only happens when the user explicitly enables notifications.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    registerServiceWorker().catch(() => undefined)
  })
}
