import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './themes/tokens.css'
import App from './App'
import UIElementsShowcase from './components/IndustrialUI/UIElementsShowcase'

const showUIElements = new URLSearchParams(window.location.search).has('ui-elements')
document.documentElement.toggleAttribute('data-ui-elements', showUIElements)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showUIElements ? <UIElementsShowcase /> : <App />}
  </StrictMode>
)
