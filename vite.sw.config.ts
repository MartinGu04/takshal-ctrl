import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/**
 * Builds the service worker as one self-contained classic script at /sw.js (fixed name and
 * root scope). Classic rather than module workers, for the widest browser support.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    publicDir: false,
    define: {
      // A new build always yields a byte-different worker, so browsers pick up the update.
      __SW_VERSION__: JSON.stringify(`${pkg.version}+${Date.now().toString(36)}`),
      __VAPID_PUBLIC_KEY__: JSON.stringify(env.VITE_VAPID_PUBLIC_KEY ?? ''),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      copyPublicDir: false,
      target: 'es2020',
      sourcemap: false,
      lib: {
        entry: 'src/sw/service-worker.ts',
        formats: ['iife'],
        name: 'takshalServiceWorker',
        fileName: () => 'sw.js',
      },
    },
  }
})
