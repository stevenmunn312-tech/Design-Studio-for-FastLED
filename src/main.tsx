import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './themes/tokens.css'
import App from './App'

// Dev-only: warn if any infinitely-animated element grows a CSS filter again
// (an unbounded GPU-memory leak in Chromium). Tree-shaken out of production.
if (import.meta.env.DEV) import('./dev/animationFilterGuard')

// A lazy chunk that will not load means this page is older than the files
// behind it: an update (a rebuilt desktop app, a new deploy) activated a new
// service worker, which dropped the old hashed chunks while the old shell was
// still on screen. With no chunk the popup that asked for it throws and the
// whole app unmounts to a blank window. Reloading picks up the new shell; the
// stamp stops a loop when the chunk is missing for some other reason.
function reloadOnce(): boolean {
  const stamp = 'design-studio-for-fastled.chunk-reload'
  try {
    if (Date.now() - Number(sessionStorage.getItem(stamp) ?? 0) < 30_000) return false
    sessionStorage.setItem(stamp, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault()
})

// The same update, caught earlier. The first page load after an update is
// still served from the old precache, and the new service worker takes over
// a few seconds later. Reloading at that moment puts the new build on screen
// in the same launch, instead of leaving the old one running (old bundled
// patterns included) until the app is opened a second time. A first install
// has no previous controller and needs no reload.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => { reloadOnce() })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
