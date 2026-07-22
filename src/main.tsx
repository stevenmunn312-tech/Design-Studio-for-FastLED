import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './themes/tokens.css'
import App from './App'

// Dev-only: warn if any infinitely-animated element grows a CSS filter again
// (an unbounded GPU-memory leak in Chromium). Tree-shaken out of production.
if (import.meta.env.DEV) import('./dev/animationFilterGuard')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
