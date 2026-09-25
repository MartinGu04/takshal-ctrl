# TAKSHAL CTRL

A single, cinematic gateway to two independent systems: **Avaria** and **המחלבה**.

TAKSHAL CTRL is a small static web app. It does **not** merge, import or proxy either system —
each keeps its own repository, deployment, logic and data. The portal only knows one URL per
system and hands the user over to it in the same tab.

## Getting started

```bash
npm install
npm run dev
```

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Vite dev server                                |
| `npm run build`     | Typecheck + production build to `dist/`        |
| `npm run preview`   | Serve the production build                     |
| `npm run lint`      | oxlint (incl. jsx-a11y rules)                  |
| `npm run typecheck` | TypeScript, no emit                            |
| `npm test`          | Unit/component tests (Vitest + Testing Library)|
| `npm run test:e2e`  | Playwright, desktop + mobile, against a build (incl. visual snapshots) |
| `npm run check`     | lint → typecheck → unit tests → build          |

For `test:e2e`, run `npx playwright install chromium` once, or point
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` at an existing Chromium. After an intentional visual change,
refresh the baselines with `npx playwright test e2e/visual.spec.ts --update-snapshots`.

## Configuring destinations

Destinations live in one place, `DEFAULT_DESTINATIONS` in
[`src/config/systems.ts`](src/config/systems.ts). No component contains a URL, and none is
displayed in the interface.

| System  | Production URL                 | Optional build-time override |
| ------- | ------------------------------ | ---------------------------- |
| Avaria  | `https://takalot.vercel.app/`  | `VITE_AVARIA_URL`            |
| המחלבה  | `https://luzly.vercel.app/`    | `VITE_MACHLAVA_URL`          |

Accepted values are absolute `http(s)` URLs or same-origin paths (e.g. `/avaria/`). Anything
else — missing, malformed, `javascript:`, `data:` — is rejected by
[`src/config/destination.ts`](src/config/destination.ts) and that entry renders as
"not configured" instead of as a broken link.

Display copy (names, taglines, CTA labels) and each system's logo live in
[`src/config/systems.ts`](src/config/systems.ts).

## Brand assets

The supplied logos are the source of truth and are never redrawn or recoloured.

| Original (`brand/source/`)          | Web asset (`src/assets/brand/`)      | Used for                            |
| ----------------------------------- | ------------------------------------ | ----------------------------------- |
| `avaria-logo.png`                   | `avaria-logo.webp`                   | Avaria world heading                |
| `machlava-logo.webp`                | `machlava-logo.webp`                 | המחלבה world heading (one use only) |
| `502-strategic-communication.webp`  | `502-strategic-communication.webp`   | quiet shell insignia                |
| `502-satcom.webp`                   | `502-satcom.webp`                    | quiet shell insignia                |

Web assets are produced by `python3 scripts/prepare-brand-assets.py` (Pillow + numpy). It only
crops empty canvas and converts each logo's flat background colour to transparency (GIMP's
colour-to-alpha), so the result composited over the original background is identical to the
source; the script prints the re-composite error as proof. The המחלבה emblem's own circular
night sky is kept fully opaque. To update a logo, replace the original and re-run the script.

Set the variables in your host's build settings (Vercel, Netlify, Cloudflare Pages, GitHub
Actions…) and deploy `dist/` as a static site.

## Structure

```
src/
  config/            the only place the portal knows about the two systems
    destination.ts   URL validation
    systems.ts       names, copy, env → destinations
  features/gateway/  the split-screen gateway
    Gateway.tsx      state: hover/focus emphasis, hand-off
    World.tsx        one system's half: content + CTA
    Seam.tsx         illuminated divider + TAKSHAL CTRL wordmark
    backdrops/       decorative art per world (aria-hidden)
    useLaunch.ts     hand-off transition → same-tab navigation
    gateway.css      layout, both visual identities, motion
  lib/               small shared hooks/utilities
  styles/global.css  tokens, fonts, reset
  App.tsx            app shell
```

## Design notes

- **Composition.** Full-viewport split. The document is RTL, so Avaria (first in reading and tab
  order) is on the right and המחלבה on the left. Below 760px the worlds stack vertically and the
  seam turns horizontal, carrying the wordmark.
- **The seam** is the portal's identity: a light beam that splits the wordmark
  (`TAKSHAL ┃ CTRL`), with a centre node whose arms lean toward the active world.
- **Interaction.** Hovering or focusing a world makes it dominant (~58/42), brightens its layers
  and lifts its CTA; the other recedes. The whole half is the click/tap target. On click the
  chosen world fills the screen for ~0.5s, then navigates. Modified clicks (⌘/Ctrl/Shift, middle
  click) are left to the browser.
- **Brand-true worlds**, referenced from the real entry screens. Avaria: black-purple base,
  deep violet atmosphere, fine dotted grid, concentric targeting rings and a horizon line behind
  the mark, one heartbeat line. המחלבה: almost-black navy, an extremely faint grid, sparse blue
  light, a radial dial with a slow sweep around the emblem, and restrained SATCOM cues (a few
  stars, quiet orbits, a dish). The portal itself (wordmark, seam core) stays neutral white;
  the seam glows blue toward המחלבה and violet toward Avaria.
- **Motion identities.** Avaria: heartbeat pulse, atmosphere breathing. המחלבה: dial sweep,
  orbital drift, star twinkle, dish signal.
- **No fake telemetry, no routing details.** The only interface copy is each system's name,
  Avaria's tagline and the two entry actions. The hand-off is announced to assistive
  technology ("מתחבר ל־…").
- **Reduced motion.** All animation stops, the split no longer moves, links navigate directly.
  The static composition is designed to stand on its own.
- **Backdrops are sized to the viewport, not the half,** so the seam slides over them like a
  window instead of stretching them.
- Fonts are self-hosted (Space Grotesk, Heebo, JetBrains Mono) — no third-party requests.

## Extending

The app shell (`App.tsx`) is where cross-cutting layers can mount beside the gateway without
touching it — e.g. a future PWA install prompt, service worker registration, or a centralised
notification layer fed by both systems. A web manifest is already in `public/`; no service
worker is registered yet.
