#!/usr/bin/env node
/**
 * Renders the TAKSHAL CTRL PWA icons from public/favicon.svg (the existing, temporary app mark —
 * no dedicated app icon exists yet). Uses Playwright's Chromium, already a dev dependency.
 *
 * Usage: node scripts/render-app-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url)
const INK = '#030306'

const icons = [
  // Standard icons keep the favicon's own rounded shape on transparency.
  { name: 'icon-192.png', size: 192, inset: 0, background: 'transparent' },
  { name: 'icon-512.png', size: 512, inset: 0, background: 'transparent' },
  // Maskable: full-bleed background, artwork inside the 80% safe zone.
  { name: 'icon-maskable-512.png', size: 512, inset: 0.12, background: INK },
  // iOS masks the icon itself and does not support transparency.
  { name: 'apple-touch-icon.png', size: 180, inset: 0.06, background: INK },
]

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined })
const page = await browser.newPage({ deviceScaleFactor: 1 })
for (const { name, size, inset, background } of icons) {
  const pad = Math.round(size * inset)
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:${background}">
      <div style="width:${size}px;height:${size}px;box-sizing:border-box;padding:${pad}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    </body></html>`,
  )
  writeFileSync(out(name), await page.screenshot({ omitBackground: background === 'transparent', type: 'png' }))
  console.log(`${name} ${size}x${size}`)
}
await browser.close()
