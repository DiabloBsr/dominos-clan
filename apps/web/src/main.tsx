import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA : installable sur l'écran d'accueil, assets en cache dès la 2e visite.
// La navigation reste réseau-d'abord (voir sw.js) : jamais d'app périmée.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // pas de service worker (vieux navigateur, mode privé…) : l'app marche pareil
    })
  })
}
