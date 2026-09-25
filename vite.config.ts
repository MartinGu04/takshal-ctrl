/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { build, defineConfig, loadEnv, type Plugin } from 'vite'
import { findClientExposedSecrets } from './src/shared/supabaseKeys.ts'

const swConfig = fileURLToPath(new URL('./vite.sw.config.ts', import.meta.url))

/** Serves a freshly built /sw.js during `vite dev` (production builds emit it via vite.sw.config.ts). */
function serviceWorkerInDev(): Plugin {
  return {
    name: 'takshal:service-worker-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/sw.js', async (_req, res, next) => {
        try {
          const result = await build({ configFile: swConfig, mode: 'development', logLevel: 'silent', build: { write: false, minify: false } })
          const outputs = Array.isArray(result) ? result : [result]
          const chunk = outputs.flatMap((output) => ('output' in output ? output.output : [])).find((item) => item.type === 'chunk')
          if (!chunk || chunk.type !== 'chunk') throw new Error('service worker build produced no chunk')
          res.setHeader('content-type', 'text/javascript; charset=utf-8')
          res.setHeader('cache-control', 'no-cache')
          res.end(chunk.code)
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

/**
 * Refuses to build or serve when a Supabase secret key (sb_secret_… or a legacy service_role
 * JWT) sits in a VITE_-prefixed variable: those are inlined into the public browser bundle.
 */
function guardClientSecrets(mode: string): void {
  const leaked = findClientExposedSecrets(loadEnv(mode, process.cwd(), 'VITE_'))
  if (leaked.length) {
    throw new Error(
      `Refusing to bundle a Supabase secret key into the browser: ${leaked.join(', ')}. ` +
        'Use the publishable key (sb_publishable_…) in VITE_SUPABASE_PUBLISHABLE_KEY; the secret key belongs only in SUPABASE_SECRET_KEY (server).',
    )
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  guardClientSecrets(mode)
  return {
    plugins: [react(), serviceWorkerInDev()],
    build: {
      target: 'es2022',
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
      css: false,
    },
  }
})
