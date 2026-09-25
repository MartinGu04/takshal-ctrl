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
| `npm run vapid:generate` | print a new VAPID key pair (see Notification Hub) |

For `test:e2e`, run `npx playwright install chromium` once, or point
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` at an existing Chromium. After an intentional visual change,
refresh the baselines with `npx playwright test e2e/visual.spec.ts --update-snapshots`.

## Configuring destinations

Destinations live in one place, `DEFAULT_DESTINATIONS` in
[`src/shared/destinations.ts`](src/shared/destinations.ts) (shared by the page, the service worker
and the server). No component contains a URL, and none is
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
  config/                 the only place the portal knows about the two systems
    destination.ts        URL validation
    systems.ts            names, copy, env → destinations
  shared/                 environment-neutral code used by page, service worker AND server
    destinations.ts       production base URLs
    notifications/        payload schema (v1), sources + trusted icons, target validation, /open routing
  features/gateway/       the split-screen gateway
  features/notifications/ enrollment UI + state machine (controller.ts), push/auth/API adapters
  features/handoff/       /open — validated notification-click hand-off
  sw/                     service worker (logic.ts is pure and unit-tested)
  lib/  styles/  App.tsx  shared hooks, tokens, app shell
server/                   Notification Hub (framework-agnostic Request → Response handlers)
  handlers.ts             subscribe / unsubscribe / status / test / rotate
  delivery.ts             fan-out, dead-subscription cleanup
  validation.ts           PushSubscription + push-service allowlist
  auth.ts  store*.ts  sender.ts  env.ts  deps.ts
api/push/*.ts             Vercel functions (thin adapters over server/handlers.ts)
supabase/migrations/      database schema, RLS, grants
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

## Notification Hub (v0.2.0)

TAKSHAL CTRL is the single installed PWA that owns the Web Push subscription for **both**
Avaria and המחלבה. The portal stays fully usable anonymously; Google sign-in is required only
when someone chooses to enable or manage notifications (the bell in the top-left corner).

```
Avaria backend ────┐   (next phase: per-source credentials)
                   ├──▶ TAKSHAL CTRL Notification Hub ──▶ Web Push (FCM / Mozilla / Apple)
המחלבה backend ────┘          │                                    │
                     Supabase: auth.users,                 TAKSHAL CTRL service worker
                     push_subscriptions,                   → branded notification
                     notification_events                   → click → /open → validated destination
```

### What is implemented

| Capability | Where |
| --- | --- |
| Secure identity (Google via Supabase Auth; JWT verified server-side on every call) | `src/features/notifications/auth.ts`, `server/auth.ts` |
| Register a device push subscription (service worker owns it; VAPID) | `controller.ts`, `pushClient.ts`, `src/sw/service-worker.ts` |
| Persist it (dedup by endpoint, many devices per user, cap of 20) | `server/handlers.ts`, `supabase/migrations/…_notification_hub.sql` |
| Test push to the signed-in user only (rate limited: 5 / 10 min) | `POST /api/push/test` |
| Receive + display branded notifications (Avaria / המחלבה / TAKSHAL CTRL) | `src/sw/logic.ts`, `public/icons/notify-*.png` |
| Safe click handling (same-origin `/open`, relative targets only, trusted base URLs) | `src/shared/notifications/handoff.ts`, `src/features/handoff/` |
| Unsubscribe current device (also on sign-out) | `POST /api/push/unsubscribe` |
| Lifecycle: resubscribe, rotation (`pushsubscriptionchange`), expired, 404/410 gone → deleted, repeated failures → disabled | `controller.ts`, `handleRotate`, `server/delivery.ts` |

API (all `POST`, JSON, same origin; all but `rotate` require `Authorization: Bearer <Supabase access token>`):
`/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/status`, `/api/push/test`,
`/api/push/rotate` (called by the service worker; authorised by possession of the previous
endpoint). There is deliberately **no** public "send notification" endpoint.

### Notification payload (v1)

```jsonc
{
  "v": 1,
  "source": "avaria" | "machlava" | "system",
  "title": "≤ 120 chars",
  "body": "≤ 500 chars",
  "target": "/incident/123",   // optional, relative path within the source system only
  "tag": "incident-123",        // optional, [A-Za-z0-9._:-]{1,64}
  "timestamp": 1760000000000    // optional, ms
}
```

Validated on the server before sending and again in the service worker. Unknown fields are
dropped: payloads can never provide an icon or a URL. The icon comes from the source
(`/icons/notify-avaria-192.png`, `/icons/notify-machlava-192.png`, `/icons/icon-192.png`),
and source notifications are titled `Avaria · …` / `המחלבה · …`, because iOS shows only the
app's own icon. A click opens `/open?app=<source>&target=<path>` on TAKSHAL CTRL, which accepts
only `avaria` / `machlava` and a safe relative path, and builds the final URL from
`DEFAULT_DESTINATIONS` (`https://takalot.vercel.app/`, `https://luzly.vercel.app/`). External
URLs, `//host`, backslashes, whitespace/control characters and `javascript:` are rejected.

### Security properties

- Recipients are always derived from the verified session; the browser never names a user or email.
- Supabase **service role key** and **VAPID private key** exist only in server env vars (never
  `VITE_`-prefixed, never bundled). The anon/publishable key in the bundle cannot read or write
  the hub tables: RLS is on with no policies, and privileges are revoked from `anon`/`authenticated`.
- Push endpoints are treated as secrets: never returned by the API, never logged (logs use a
  `host…last6` fingerprint), and restricted to the known push services (prevents SSRF).
- JSON-only bodies (≤ 8 KB), strict validation on every field, no CORS (cross-origin calls fail
  preflight), `Cache-Control: no-store` on API responses.
- Stored personal data is minimal: Supabase user id, the subscription, an optional coarse
  device label ("iOS · Home Screen") — no raw user agent, no notification content.

### Setup — what you still need to do manually

> Everything in the repository is ready; the steps below are the external configuration only
> you can perform (they involve accounts and secrets).

**1. Backend (Supabase).** Create a dedicated Supabase project for TAKSHAL CTRL (not the
Avaria or המחלבה databases). Note its **Project URL**, **anon/publishable key** and **service
role/secret key** (Project Settings → API).

**2. Google authentication.**
1. Google Cloud Console → APIs & Services → OAuth consent screen: configure (External or
   Internal for a Workspace org), app name "TAKSHAL CTRL".
2. Credentials → Create credentials → OAuth client ID → *Web application*.
   - Authorized JavaScript origins: your production origin (e.g. `https://takshal-ctrl.vercel.app`) and `http://localhost:3000`.
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Sign In / Providers → **Google**: enable, paste the client ID and secret.
4. Supabase → Authentication → URL Configuration:
   - Site URL: your production origin.
   - Redirect URLs: `https://<production-origin>/**`, `http://localhost:3000/**`, and (for
     preview deployments) `https://*-<your-vercel-scope>.vercel.app/**`.

**3. Database migration.** Either paste
`supabase/migrations/20260925120000_notification_hub.sql` into Supabase → SQL Editor and run
it, or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.

**4. VAPID keys.** Generate once and keep them forever (changing them invalidates every
existing subscription):

```bash
npm run vapid:generate      # prints a Public Key and a Private Key
```

Do not commit them. The public key goes into `VITE_VAPID_PUBLIC_KEY`, the private key into
`VAPID_PRIVATE_KEY` (server only).

**5. Local environment** — `.env.local` (git-ignored), see `.env.example`:

| Variable | Scope | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | client (public) | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | client (public) | anon / publishable key |
| `VITE_VAPID_PUBLIC_KEY` | client (public) | VAPID public key |
| `SUPABASE_URL` | server | optional — defaults to `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | **server secret** | service role / secret key |
| `VAPID_PRIVATE_KEY` | **server secret** | VAPID private key |
| `VAPID_SUBJECT` | server | `mailto:you@yourdomain` (or an `https://` URL) |

**6. Vercel environment variables.** Project → Settings → Environment Variables: add all
seven above for **Production** and **Preview** (mark `SUPABASE_SERVICE_ROLE_KEY` and
`VAPID_PRIVATE_KEY` as *Sensitive*), then redeploy. `VITE_*` values are baked in at build time,
so a redeploy is required after changing them. The `api/` directory is deployed as Vercel
Functions automatically; `vercel.json` adds the `/open` rewrite and `sw.js` cache headers.

**7. Localhost testing.**
- `npm run dev` serves the UI and a live-built `/sw.js`, but **not** `/api/*`. For the full flow
  use `npx vercel link` once, `npx vercel env pull .env.local`, then `npx vercel dev`
  (http://localhost:3000).
- `http://localhost` counts as a secure context, so push works in Chrome, Edge and Firefox on
  desktop. iPhone/iPad cannot reach your localhost — test iOS on a deployed (HTTPS) preview.
- Add the localhost origin to Google's JavaScript origins and Supabase's Redirect URLs (step 2).
- Automated tests never contact a real push service: the push sender, Supabase and PushManager
  are mocked at their boundaries, and e2e drives the real service worker through Chromium's
  DevTools protocol.

**8. iPhone / iPad enrollment** (iOS/iPadOS 16.4 or later):
1. Open the production URL in **Safari**.
2. Share → **Add to Home Screen** → Add. (The bell explains this if you open it in a Safari tab.)
3. Open **TAKSHAL CTRL from the Home Screen** (push only exists inside the installed web app,
   and it has its own storage — sign in there, not in Safari).
4. Tap the bell → **התחברות עם Google** → choose your account.
5. Tap **הפעלת התראות במכשיר זה** → **Allow** in the iOS prompt.

**9. Test notification.** In the bell panel, tap **שליחת התראת בדיקה**. You should receive
"TAKSHAL CTRL — ההתראות מחוברות ועובדות." within seconds (lock the phone or switch apps to see
the banner). Tapping it opens TAKSHAL CTRL. Up to 5 tests per 10 minutes per user.

**Manual real-device checklist** (not automatable in CI):
- [ ] iPhone: installed app → sign in → enable → test push arrives on the lock screen → tap opens TAKSHAL CTRL.
- [ ] iPhone: iOS Settings → Notifications → TAKSHAL CTRL shows the app with notifications allowed.
- [ ] Android Chrome and a desktop browser on the same account: both receive the test (multi-device).
- [ ] **כיבוי במכשיר זה** on one device: that device stops receiving; the other still does.
- [ ] Remove the Home Screen app, then send a test from another device: the dead iPhone
      subscription is deleted on the next send (410 from Apple).

**10. Next phase: Avaria and המחלבה integration (designed, not implemented).**
- New protected server endpoints, e.g. `POST /api/v1/sources/avaria/notify` and
  `/api/v1/sources/machlava/notify`, each with its **own** credential
  (`HUB_SOURCE_SECRET_AVARIA`, `HUB_SOURCE_SECRET_MACHLAVA`), verified as an HMAC over the
  body plus a timestamp (replay window). A leaked Avaria credential cannot act as המחלבה:
  the source identity comes from the credential, never from the request body.
- The source addresses a recipient by the verified Google email of the TAKSHAL CTRL user;
  the hub resolves it to a Supabase user id server-side.
- The hub builds the payload with `createNotificationPayload({ source, title, body, target })`
  (source fixed by the credential), delivers with `deliver()` (`server/delivery.ts`), and records
  a `notification_events` row with `kind = 'source'`.
- Avaria and המחלבה keep their own repositories and databases; they only gain a server-side
  call to the hub. No change to them is needed in this phase.

### Icons

The PWA icons (`public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
`apple-touch-icon.png`) are rendered from the existing `favicon.svg` by
`node scripts/render-app-icons.mjs`. **This is a temporary asset: TAKSHAL CTRL has no dedicated
app icon yet.** Replace `favicon.svg` (or the PNGs) when one exists. The notification icons
`notify-avaria-192.png` / `notify-machlava-192.png` are crops of the supplied logos, produced by
`scripts/prepare-brand-assets.py`.
