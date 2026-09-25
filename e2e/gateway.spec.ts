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

/** A world's share of the viewport width, 0…1. */
const share = async (page: Page, name: string) =>
  (await region(page, name).boundingBox())!.width / page.viewportSize()!.width

/** Resolves once every transition and finite animation (intro, split) has finished; ambient loops aside. */
const settled = (page: Page) =>
  page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  )

/** Where things sit on screen, to prove they stay put. */
const boxOf = async (page: Page, selector: string) => {
  const { x, y, width, height } = (await page.locator(selector).boundingBox())!
  return [x, y, width, height].map((n) => Math.round(n))
}

test.beforeEach(async ({ page }) => {
  await stubDestinations(page)
  await page.goto('/')
  // Park the pointer outside the page so a resting cursor can't emphasise a world.
  await page.mouse.move(-1, -1)
})

test('shows the portal identity and both worlds without horizontal scroll', async ({ page }) => {
  await expect(page).toHaveTitle('TAKSHAL CTRL')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TAKSHAL CTRL')
  await expect(region(page, 'Avaria')).toBeVisible()
  await expect(region(page, 'המחלבה')).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('splits side by side on desktop and stacks on mobile', async ({ page, isMobile }) => {
  await expect(page.locator('main')).toHaveAttribute('data-active', 'none')
  // Let any emphasis transition from page load settle before measuring.
  await expect
    .poll(async () => (await region(page, 'Avaria').boundingBox())!.width, { timeout: 3000 })
    .toBeCloseTo(isMobile ? page.viewportSize()!.width : page.viewportSize()!.width / 2, 0)
  const a = (await region(page, 'Avaria').boundingBox())!
  const m = (await region(page, 'המחלבה').boundingBox())!
  const viewport = page.viewportSize()!

  // The pointer parallax exists only for the side-by-side layout with a real pointer.
  if (isMobile) await expect(page.locator('main')).not.toHaveAttribute('data-parallax')
  else await expect(page.locator('main')).toHaveAttribute('data-parallax')

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

test('supplied logos render crisp and correctly proportioned, with neither side overwhelming', async ({ page }) => {
  const logos = await page.getByRole('heading', { level: 2 }).locator('img').evaluateAll((imgs) =>
    (imgs as HTMLImageElement[]).map((img) => {
      const box = img.getBoundingClientRect()
      return {
        alt: img.alt,
        loaded: img.complete && img.naturalWidth > 0,
        naturalRatio: img.naturalWidth / img.naturalHeight,
        renderedRatio: box.width / box.height,
        // Source pixels available per rendered device pixel (>= 1 means no upscaling blur).
        density: img.naturalWidth / (box.width * window.devicePixelRatio),
        area: box.width * box.height,
      }
    }),
  )

  expect(logos.map((l) => l.alt)).toEqual(['Avaria', 'המחלבה'])
  for (const logo of logos) {
    expect(logo.loaded, `${logo.alt} loaded`).toBe(true)
    expect(Math.abs(logo.renderedRatio / logo.naturalRatio - 1), `${logo.alt} aspect ratio`).toBeLessThan(0.01)
    expect(logo.density, `${logo.alt} crispness`).toBeGreaterThanOrEqual(1)
  }

  // The wide Avaria mark and the dense המחלבה lockup are sized to comparable visual weight.
  const [avaria, machlava] = logos
  const ratio = machlava!.area / avaria!.area
  expect(ratio).toBeGreaterThan(0.8)
  expect(ratio).toBeLessThan(2.4)
})

test('hovering a world leans the split to about 57/43, and leaving settles it back (desktop)', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'hover only applies to fine pointers')
  const main = page.locator('main')

  await region(page, 'Avaria').hover()
  await expect(main).toHaveAttribute('data-active', 'avaria')
  await expect.poll(() => share(page, 'Avaria')).toBeCloseTo(0.57, 2)
  expect(await share(page, 'המחלבה')).toBeCloseTo(0.43, 2)

  await page.mouse.move(-1, -1)
  await expect(main).toHaveAttribute('data-active', 'none')
  await expect.poll(() => share(page, 'Avaria')).toBeCloseTo(0.5, 2)
})

test('moving straight across hands the split to the other world, seam on the boundary (desktop)', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'hover only applies to fine pointers')
  const main = page.locator('main')
  const viewport = page.viewportSize()!

  await page.mouse.move(viewport.width * 0.8, viewport.height / 2)
  await expect.poll(() => share(page, 'Avaria')).toBeCloseTo(0.57, 2)

  await page.mouse.move(viewport.width * 0.2, viewport.height / 2, { steps: 6 })
  await expect(main).toHaveAttribute('data-active', 'machlava')
  await expect(main).toHaveAttribute('data-crossing', 'machlava')
  await expect.poll(() => share(page, 'המחלבה')).toBeCloseTo(0.57, 2)

  // The seam sits exactly where the worlds meet, and nothing widens the page.
  const seam = (await page.locator('.seam').boundingBox())!
  const left = (await region(page, 'המחלבה').boundingBox())!
  expect(Math.abs(seam.x - (left.x + left.width))).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})

test('micro-parallax drifts the backdrop but never the content (desktop)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no pointer parallax on touch')
  const viewport = page.viewportSize()!
  const rings = page.locator('.av-corner-rings')
  const drift = () => rings.evaluate((el) => getComputedStyle(el).translate)

  // Two resting points inside Avaria, so the split itself stays put between them.
  await page.mouse.move(viewport.width * 0.6, viewport.height * 0.2)
  await expect(page.locator('main')).toHaveAttribute('data-active', 'avaria')
  await settled(page)
  const content = ['.cta--avaria .cta__frame', '.world--avaria .world__logo', '.cta--machlava .cta__frame']
  const before = await Promise.all(content.map((selector) => boxOf(page, selector)))
  const driftBefore = await drift()

  await page.mouse.move(viewport.width * 0.98, viewport.height * 0.95, { steps: 5 })
  await expect.poll(drift).not.toBe(driftBefore)
  await settled(page)
  expect(await Promise.all(content.map((selector) => boxOf(page, selector)))).toEqual(before)
})

test('is fully keyboard operable', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is checked on desktop')
  await page.mouse.move(-1, -1)
  await page.keyboard.press('Tab')
  await expect(avaria(page)).toBeFocused()
  await expect(region(page, 'Avaria')).toHaveAttribute('data-state', 'active')
  // Focus gets the same treatment as hover, split included.
  await expect.poll(() => share(page, 'Avaria')).toBeCloseTo(0.57, 2)

  const ring = await avaria(page)
    .locator('.cta__frame')
    .evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(ring).toBe('solid')

  await page.keyboard.press('Tab')
  await expect(machlava(page)).toBeFocused()
  await expect(region(page, 'המחלבה')).toHaveAttribute('data-state', 'active')
  // Tabbing across is one hand-over, not a drop to idle and a fresh start.
  await expect(page.locator('main')).toHaveAttribute('data-crossing', 'machlava')
  await expect.poll(() => share(page, 'המחלבה')).toBeCloseTo(0.57, 2)

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(E2E_MACHLAVA_URL)
})

test('keyboard focus takes emphasis from a resting mouse (desktop)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'hover only applies to fine pointers')
  await region(page, 'המחלבה').hover()
  await expect(page.locator('main')).toHaveAttribute('data-active', 'machlava')
  await avaria(page).focus()
  await expect(page.locator('main')).toHaveAttribute('data-active', 'avaria')
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
    // Transitions (short opacity/colour fades) are allowed; keyframe animations are not.
    const running = await page.evaluate(
      () => document.getAnimations().filter((a) => a instanceof CSSAnimation && a.playState === 'running').length,
    )
    expect(running).toBe(0)
    await expect(page.locator('main')).not.toHaveAttribute('data-parallax')

    if (!isMobile) {
      const before = (await region(page, 'Avaria').boundingBox())!.width
      await region(page, 'Avaria').hover()
      await expect(region(page, 'Avaria')).toHaveAttribute('data-state', 'active')
      expect((await region(page, 'Avaria').boundingBox())!.width).toBeCloseTo(before, 0)
      // No surge, ripple or flare either: nothing new starts on hover.
      const started = await page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSAnimation).length)
      expect(started).toBe(0)
    }

    await avaria(page).click()
    await expect(page).toHaveURL(E2E_AVARIA_URL)
  })
})
