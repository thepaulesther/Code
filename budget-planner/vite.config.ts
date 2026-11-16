import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { execSync } from 'node:child_process'

// Which version this is, shown at the bottom of Settings: the commit it was built from and when.
const gitOr = (cmd: string, fallback: string) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback
  } catch {
    return fallback
  }
}
const BUILD = {
  commit: gitOr('git rev-parse --short HEAD', 'local'),
  date: gitOr('git log -1 --format=%cI', new Date().toISOString()),
}

// `vite build --mode artifact` makes one self-contained HTML file for sharing as a single page.
// That build drops the manifest, icons and service worker, which need real files next to the page.
const stripPwaTags = (): Plugin => ({
  name: 'strip-pwa-tags',
  transformIndexHtml: (html) => html.replace(/\s*<!-- pwa -->[\s\S]*?<!-- \/pwa -->/g, ''),
})

export default defineConfig(({ mode }) => ({
  base: './', // relative URLs so it works from any sub-path, e.g. GitHub Pages
  define: {
    __BUILD_COMMIT__: JSON.stringify(BUILD.commit),
    __BUILD_DATE__: JSON.stringify(BUILD.date),
  },
  plugins: mode === 'artifact' ? [react(), stripPwaTags(), viteSingleFile()] : [react()],
  build: mode === 'artifact' ? { outDir: 'dist-artifact', copyPublicDir: false } : undefined,
}))
