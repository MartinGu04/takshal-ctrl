import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { E2E_AVARIA_URL, E2E_MACHLAVA_URL, E2E_SUPABASE_URL } from './destinations.ts'

/**
 * Notification hub, end to end against the production build. External boundaries are mocked:
 * Supabase Auth (a pre-seeded session), the browser push service (PushManager), and the hub
 * API (/api/push/*). The real service worker is exercised via Chromium's DevTools protocol.
 */

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/e2e-device'

// The lightweight headless shell has no notification support; use full Chromium (new headless).
test.use({ channel: 'chromium' })

/** Headless browsers default to "denied"; start from the untouched "default" state. */
function neutralPermission(page: Page) {
  return page.addInitScript(() => {
    if (Notification.permission === 'denied') Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'default' })
  })
}

function seedSession(context: BrowserContext) {
  return context.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    {
      key: 'takshal-ctrl-auth',
      session: {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user-e2e', aud: 'authenticated', role: 'authenticated', email: 'operator@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      },
    },
  )
}

/** Replaces the browser push service with a local fake (no FCM/APNs traffic in CI). */
function fakePushService(context: BrowserContext) {
  return context.addInitScript((endpoint) => {
    let current: unknown = null
    const make = () => {
      const sub = {
        endpoint,
        expirationTime: null,
        options: { userVisibleOnly: true },
        toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'BIPUL12DLfytvTajnryr2PRdAgXS3HGKiLqndGcJGabyhHheJYlNGCeXl1dn18gSJ1WAkAPIxr4gK0_dQds4yiI', auth: 'FPssNDTKnInHVndSTdbKFw' } }),
        unsubscribe: async () => {
          current = null
          return true
        },
      }
      return sub
    }
    PushManager.prototype.subscribe = async function () {
      current ??= make()
      return current as PushSubscription
    }
    PushManager.prototype.getSubscription = async function () {
      return current as PushSubscription | null
    }
  }, ENDPOINT)
}

async function mockHub(page: Page) {
  const calls: { path: string; auth: string | null; body: Record<string, unknown> }[] = []
  let registered = false
  await page.route('**/api/push/*', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
    calls.push({ path, auth: request.headers().authorization ?? null, body })
    const reply = (status: number, json: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
    if (path.endsWith('/subscribe')) {
      registered = true
      return reply(201, { subscription: { id: 's1', enabled: true } })
    }
    if (path.endsWith('/status')) return reply(200, { registered, devices: registered ? 1 : 0 })
    if (path.endsWith('/unsubscribe')) {
      registered = false
      return reply(200, { removed: true })
    }
    if (path.endsWith('/test')) return reply(200, { delivered: 1, failed: 0, removed: 0 })
    return reply(404, { error: 'not-found' })
  })
  await page.route(`${E2E_SUPABASE_URL}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  return calls
}

test.describe('PWA', () => {
  test('serves a complete manifest with reachable icons', async ({ page, request }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    const manifest = await (await request.get(href!)).json()
    expect(manifest).toMatchObject({ id: '/', name: 'TAKSHAL CTRL', short_name: 'TAKSHAL CTRL', display: 'standalone', start_url: '/', scope: '/' })
    const sizes = manifest.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes}:${icon.purpose}`)
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']))
    for (const icon of [...manifest.icons, { src: '/icons/apple-touch-icon.png' }, { src: '/icons/notify-avaria-192.png' }, { src: '/icons/notify-machlava-192.png' }]) {
      expect((await request.get(icon.src)).status(), icon.src).toBe(200)
    }
  })

  test('registers the service worker without asking for permission', async ({ page }) => {
    let prompted = false
    page.on('dialog', () => (prompted = true))
    await page.goto('/')
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
    expect(scope).toMatch(/\/$/)
    expect(await page.evaluate(() => Notification.permission)).not.toBe('granted')
    expect(prompted).toBe(false)
  })
})

test.describe('service worker push handling', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'uses the Chromium DevTools protocol')

  /** Delivers `payload` to the real service worker (DevTools protocol) and returns the notification it shows. */
  async function deliverPush(page: Page, context: BrowserContext, baseURL: string, payload: Record<string, unknown>) {
    await context.grantPermissions(['notifications'], { origin: baseURL })
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)

    const cdp = await context.newCDPSession(page)
    const registrationId = await new Promise<string>((resolve) => {
      cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
        const match = registrations.find((registration: { scopeURL: string; isDeleted: boolean }) => registration.scopeURL.startsWith(baseURL) && !registration.isDeleted)
        if (match) resolve(match.registrationId)
      })
      void cdp.send('ServiceWorker.enable')
    })

    await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(baseURL).origin, registrationId, data: JSON.stringify(payload) })

    // Worker start-up plus notification display can take a moment on a loaded CI machine.
    await expect
      .poll(() => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length), { timeout: 15_000 })
      .toBe(1)
    return page.evaluate(async () => {
      const [notification] = await (await navigator.serviceWorker.ready).getNotifications()
      return { title: notification!.title, body: notification!.body, icon: notification!.icon, tag: notification!.tag, data: notification!.data }
    })
  }

  test('receives a push and shows a branded notification with a same-origin hand-off', async ({ page, context, baseURL }) => {
    const payload = { v: 1, source: 'avaria', title: 'תקלה חדשה', body: 'מדפסת בקומה 2', target: '/incident/123', tag: 'incident-123', icon: 'https://evil.example/x.png' }
    const shown = await deliverPush(page, context, baseURL!, payload)
    expect(shown).toEqual({
      title: 'Avaria · תקלה חדשה',
      body: 'מדפסת בקומה 2',
      icon: new URL('/icons/notify-avaria-192.png', baseURL).href,
      tag: 'incident-123',
      data: { url: '/open?app=avaria&target=%2Fincident%2F123', source: 'avaria' },
    })
  })

  test('a המחלבה source push is branded as המחלבה and hands off to its destination', async ({ page, context, baseURL }) => {
    await page.route(`${E2E_MACHLAVA_URL}**`, (route) => route.fulfill({ contentType: 'text/html', body: '<title>המחלבה stub</title>' }))
    // Exactly the payload the source ingress builds for a המחלבה notification.
    const payload = { v: 1, source: 'machlava', title: 'שינוי במשמרת', body: 'המשמרת שלך עודכנה.', target: '/schedule', tag: 'machlava-0123456789abcdef', timestamp: 1_760_000_000_000 }
    const shown = await deliverPush(page, context, baseURL!, payload)
    expect(shown).toEqual({
      title: 'המחלבה · שינוי במשמרת',
      body: 'המשמרת שלך עודכנה.',
      icon: new URL('/icons/notify-machlava-192.png', baseURL).href,
      tag: 'machlava-0123456789abcdef',
      data: { url: '/open?app=machlava&target=%2Fschedule', source: 'machlava' },
    })

    // The tap opens TAKSHAL CTRL's /open, which continues to the trusted המחלבה base + target.
    await page.goto(shown.data.url)
    await expect(page).toHaveURL(`${E2E_MACHLAVA_URL}schedule`)
  })
})

test.describe('notification enrollment', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${E2E_AVARIA_URL}**`, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Avaria stub</title>' }))
  })

  test('anonymous visitors see the portal; enabling requires Google sign-in', async ({ page }) => {
    await neutralPermission(page)
    await mockHub(page)
    const authorize = page.waitForRequest((request) => request.url().startsWith(`${E2E_SUPABASE_URL}/auth/v1/authorize`))
    await page.route(`${E2E_SUPABASE_URL}/auth/v1/authorize**`, (route) => route.fulfill({ contentType: 'text/html', body: 'google' }))

    await page.goto('/')
    await expect(page.getByRole('link', { name: 'כניסה ל־Avaria' })).toBeVisible()
    await page.getByRole('button', { name: 'התראות' }).click()
    await expect(page.getByRole('dialog', { name: 'התראות' })).toBeVisible()
    await page.getByRole('button', { name: 'התחברות עם Google' }).click()

    const url = new URL((await authorize).url())
    expect(url.searchParams.get('provider')).toBe('google')
    expect(url.searchParams.get('redirect_to')).toMatch(/\/\?notifications=1$/)
  })

  test('signed-in user enables, tests and disables notifications on this device', async ({ page, context, baseURL }) => {
    await seedSession(context)
    await fakePushService(context)
    await context.grantPermissions(['notifications'], { origin: baseURL })
    const calls = await mockHub(page)

    await page.goto('/')
    await page.getByRole('button', { name: 'התראות' }).click()
    await expect(page.getByText('operator@example.com')).toBeVisible()
    await page.getByRole('button', { name: 'הפעלת התראות במכשיר זה' }).click()
    await expect(page.getByText('ההתראות פעילות במכשיר זה.')).toBeVisible()

    const subscribe = calls.find((call) => call.path === '/api/push/subscribe')!
    expect(subscribe.auth).toBe('Bearer e2e-access-token')
    expect(subscribe.body).toMatchObject({ subscription: { endpoint: ENDPOINT, keys: { auth: 'FPssNDTKnInHVndSTdbKFw' } } })
    expect(subscribe.body).not.toHaveProperty('userId')
    expect(subscribe.body).not.toHaveProperty('email')

    await page.getByRole('button', { name: 'שליחת התראת בדיקה' }).click()
    await expect(page.getByText('התראת בדיקה נשלחה.')).toBeVisible()
    expect(calls.find((call) => call.path === '/api/push/test')!.body).toEqual({ endpoint: ENDPOINT })

    await page.getByRole('button', { name: 'כיבוי במכשיר זה' }).click()
    await expect(page.getByText('ההתראות כובו במכשיר זה.')).toBeVisible()
    expect(calls.find((call) => call.path === '/api/push/unsubscribe')!.body).toEqual({ endpoint: ENDPOINT })

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('button', { name: 'התראות' })).toBeFocused()
  })

  test('explains a blocked permission', async ({ page, context }) => {
    await seedSession(context)
    await mockHub(page)
    await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'denied' }))
    await page.goto('/')
    await page.getByRole('button', { name: 'התראות' }).click()
    await expect(page.getByText(/ההרשאה להתראות נחסמה/)).toBeVisible()
  })
})

test.describe('/open hand-off route', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${E2E_AVARIA_URL}**`, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Avaria stub</title>' }))
  })

  test('continues to the configured destination with a safe relative target', async ({ page }) => {
    await page.goto('/open?app=avaria&target=%2Fincident%2F123')
    await expect(page).toHaveURL(`${E2E_AVARIA_URL}incident/123`)
  })

  test('refuses an external target and stays on TAKSHAL CTRL', async ({ page, baseURL }) => {
    await page.goto('/open?app=avaria&target=https%3A%2F%2Fevil.example%2F')
    await expect(page.getByRole('heading', { name: 'לא ניתן לפתוח את הקישור' })).toBeVisible()
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
  })

  test('returns to the portal for TAKSHAL CTRL notifications', async ({ page, baseURL }) => {
    await page.goto('/open')
    await expect(page).toHaveURL(`${baseURL}/`)
  })
})
