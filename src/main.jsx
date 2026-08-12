import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Capture the install prompt as early as possible — the browser can fire
// `beforeinstallprompt` before React mounts. We stash it on window and
// re-emit a signal the InstallAppButton listens for.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.deferredInstallPrompt = e
  window.dispatchEvent(new Event('installpromptready'))
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
