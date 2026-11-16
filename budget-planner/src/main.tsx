import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Elora's typefaces, bundled so they work offline and no font host is contacted.
import '@fontsource/figtree/latin-400.css'
import '@fontsource/figtree/latin-500.css'
import '@fontsource/figtree/latin-600.css'
import '@fontsource/figtree/latin-700.css'
import '@fontsource/sora/latin-600.css'
import '@fontsource/sora/latin-700.css'
import './index.css'
import Root from './Root'
import { registerServiceWorker } from './lib/pwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

registerServiceWorker()
