import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Elora's typefaces, bundled so they work offline and nothing is fetched from a font host.
import '@fontsource/figtree/latin-400.css'
import '@fontsource/figtree/latin-500.css'
import '@fontsource/figtree/latin-600.css'
import '@fontsource/figtree/latin-700.css'
import '@fontsource/figtree/latin-ext-400.css'
import '@fontsource/figtree/latin-ext-600.css'
import '@fontsource/sora/latin-500.css'
import '@fontsource/sora/latin-600.css'
import '@fontsource/sora/latin-ext-600.css'
import './index.css'
import App from './App'
import { registerServiceWorker } from './lib/pwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
