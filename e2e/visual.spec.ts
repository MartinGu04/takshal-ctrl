import { expect, test } from '@playwright/test'

/**
 * Visual regression for the composition. Runs with reduced motion so the frame is static.
 * Update baselines with: npx playwright test e2e/visual.spec.ts --update-snapshots
 */
test.use({ contextOptions: { reducedMotion: 'reduce' } })

test('gateway composition', async ({ page }) => {
  await page.goto('/')
  await page.mouse.move(-1, -1)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.world__logo')).toHaveCount(2)
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('img')].every((img) => img.complete && img.naturalWidth > 0),
  )

  await expect(page).toHaveScreenshot('gateway.png', {
    fullPage: true,
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  })
})
