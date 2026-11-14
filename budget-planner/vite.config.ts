import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build --mode artifact` makes one self-contained HTML file for sharing as a single page.
// That build drops the manifest, icons and service worker, which need real files next to the page.
const stripPwaTags = (): Plugin => ({
  name: 'strip-pwa-tags',
  transformIndexHtml: (html) => html.replace(/\s*<!-- pwa -->[\s\S]*?<!-- \/pwa -->/g, ''),
})

export default defineConfig(({ mode }) => ({
  base: './', // relative URLs so it works from any sub-path, e.g. GitHub Pages
  plugins: mode === 'artifact' ? [react(), stripPwaTags(), viteSingleFile()] : [react()],
  build: mode === 'artifact' ? { outDir: 'dist-artifact', copyPublicDir: false } : undefined,
}))
