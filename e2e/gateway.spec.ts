import { expect, test, type Page } from '@playwright/test'
import { E2E_AVARIA_URL, E2E_MACHLAVA_URL } from './destinations.ts'

/** Stand-in pages for the two independent systems. */
async function stubDestinations(page: Page) {
  for (const [url, title] of [
    [E2E_AVARIA_URL, 'Avaria stub'],
    [E2E_MACHLAVA_URL, 'Machlava stub'],
  ] as const) {
    await page.route(`${url}**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: `<title>${title}</title><h1>${title}</h1>` }),
    )
  }
}

const avaria = (page: Page) => page.getByRole('link', { name: 'כניסה ל־Avaria' })
const machlava = (page: Page) => page.getByRole('link', { name: 'כניסה להמחלבה' })
const region = (page: Page, name: string) => page.getByRole('region', { name })

test.beforeEach(async ({ page }) => {
  await stubDestinations(page)
  await page.goto('/')
})

test('shows the portal identity and both worlds without horizontal scroll', async ({ page }) => {
  await expect(page).toHaveTitle('TAKSHAL CTRL')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TAKSHAL CTRL')
  await expect(region(page, 'AVARIA')).toBeVisible()
  await expect(region(page, 'המחלבה')).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('splits side by side on desktop and stacks on mobile', async ({ page, isMobile }) => {
  const a = (await region(page, 'AVARIA').boundingBox())!
  const m = (await region(page, 'המחלבה').boundingBox())!
  const viewport = page.viewportSize()!

  if (isMobile) {
    expect(a.y + a.height).toBeLessThanOrEqual(m.y + 1)
    expect(a.width).toBeCloseTo(viewport.width, 0)
    expect(a.height).toBeGreaterThanOrEqual(viewport.height * 0.4)
    expect(m.height).toBeGreaterThanOrEqual(viewport.height * 0.4)
  } else {
    // RTL: Avaria sits on the right, המחלבה on the left, each about half the viewport.
    expect(a.x).toBeGreaterThan(m.x)
    expect(a.width).toBeCloseTo(viewport.width / 2, -1)
    expect(a.height).toBeCloseTo(viewport.height, 0)
  }
})

test('hovering a world makes it dominant (desktop)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'hover only applies to fine pointers')
  const before = (await region(page, 'AVARIA').boundingBox())!.width
  await region(page, 'AVARIA').hover()
  await expect(page.locator('main')).toHaveAttribute('data-active', 'avaria')
  await expect.poll(async () => (await region(page, 'AVARIA').boundingBox())!.width).toBeGreaterThan(before + 40)
  await page.mouse.move(-1, -1)
  await expect(page.locator('main')).toHaveAttribute('data-active', 'none')
})

test('is fully keyboard operable', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is checked on desktop')
  await page.keyboard.press('Tab')
  await expect(avaria(page)).toBeFocused()
  await expect(region(page, 'AVARIA')).toHaveAttribute('data-state', 'active')

  const ring = await avaria(page)
    .locator('.cta__frame')
    .evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(ring).toBe('solid')

  await page.keyboard.press('Tab')
  await expect(machlava(page)).toBeFocused()
  await expect(region(page, 'המחלבה')).toHaveAttribute('data-state', 'active')

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(E2E_MACHLAVA_URL)
})

test('enters Avaria in the same tab', async ({ page, context }) => {
  await avaria(page).click()
  await expect(page).toHaveURL(E2E_AVARIA_URL)
  await expect(page.getByRole('heading', { name: 'Avaria stub' })).toBeVisible()
  expect(context.pages()).toHaveLength(1)
})

test('enters המחלבה in the same tab', async ({ page, context }) => {
  await machlava(page).click()
  await expect(page).toHaveURL(E2E_MACHLAVA_URL)
  expect(context.pages()).toHaveLength(1)
})

test('a tap anywhere in a world enters it (mobile)', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch flow')
  // Tapped immediately, while the intro is still playing: the hit area must already cover the world.
  const title = (await region(page, 'המחלבה').getByRole('heading').boundingBox())!
  await page.touchscreen.tap(title.x + title.width / 2, title.y + title.height / 2)
  await expect(page).toHaveURL(E2E_MACHLAVA_URL)
})

test('returning with Back restores an idle gateway', async ({ page }) => {
  await avaria(page).click()
  await expect(page).toHaveURL(E2E_AVARIA_URL)
  await page.goBack()
  await expect(page.locator('main')).not.toHaveAttribute('data-launching')
  await expect(avaria(page)).toBeVisible()
})

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('keeps the split static, runs no animations, and navigates directly', async ({ page, isMobile }) => {
    const running = await page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === 'running').length,
    )
    expect(running).toBe(0)

    if (!isMobile) {
      const before = (await region(page, 'AVARIA').boundingBox())!.width
      await region(page, 'AVARIA').hover()
      await expect(region(page, 'AVARIA')).toHaveAttribute('data-state', 'active')
      expect((await region(page, 'AVARIA').boundingBox())!.width).toBeCloseTo(before, 0)
    }

    await avaria(page).click()
    await expect(page).toHaveURL(E2E_AVARIA_URL)
  })
})
