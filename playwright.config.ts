import { defineConfig, devices } from '@playwright/test'
import { E2E_AVARIA_URL, E2E_MACHLAVA_URL, E2E_SUPABASE_PUBLISHABLE_KEY, E2E_SUPABASE_URL, E2E_VAPID_PUBLIC_KEY } from './e2e/destinations.ts'

const PORT = 4173

// Lets environments with a pre-installed Chromium (e.g. CI images) skip `playwright install`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_AVARIA_URL: E2E_AVARIA_URL,
      VITE_MACHLAVA_URL: E2E_MACHLAVA_URL,
      VITE_SUPABASE_URL: E2E_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: E2E_SUPABASE_PUBLISHABLE_KEY,
      VITE_VAPID_PUBLIC_KEY: E2E_VAPID_PUBLIC_KEY,
    },
  },
})
