/**
 * The single place TAKSHAL CTRL knows anything about the systems it fronts.
 *
 * Avaria and המחלבה are independent applications. The portal only needs a
 * display identity and an entry URL for each; URLs come from the environment
 * (see `.env.example`) so they can change without touching any component.
 */

import avariaLogo from '../assets/brand/avaria-logo.webp'
import machlavaLogo from '../assets/brand/machlava-logo.webp'
import { resolveDestination, type Destination } from './destination'

export type SystemId = 'avaria' | 'machlava'

/** A supplied brand asset, derived from brand/source/ by scripts/prepare-brand-assets.py. */
export interface BrandLogo {
  readonly src: string
  /** Intrinsic pixel size — rendered as width/height attributes so the layout never shifts. */
  readonly width: number
  readonly height: number
}

export interface SystemDefinition {
  readonly id: SystemId
  /** Accessible name; the visible name is the system's own logo. */
  readonly name: string
  readonly logo: BrandLogo
  /** Optional supporting line. Omitted when the logo already carries one. */
  readonly tagline?: string
  readonly ctaLabel: string
  readonly destination: Destination
}

export interface SystemSources {
  readonly avariaUrl?: string
  readonly machlavaUrl?: string
}

export function createSystems(sources: SystemSources, base: string): readonly [SystemDefinition, SystemDefinition] {
  return [
    {
      id: 'avaria',
      name: 'Avaria',
      logo: { src: avariaLogo, width: 1373, height: 315 },
      tagline: 'מערכת ניהול ומעקב תקלות',
      ctaLabel: 'כניסה ל־Avaria',
      destination: resolveDestination(sources.avariaUrl, base),
    },
    {
      id: 'machlava',
      name: 'המחלבה',
      // The lockup includes the system's own tagline ("החלב נגמר. המשמרת לא.").
      logo: { src: machlavaLogo, width: 960, height: 1029 },
      ctaLabel: 'כניסה להמחלבה',
      destination: resolveDestination(sources.machlavaUrl, base),
    },
  ]
}

export function systemsFromEnv(): readonly [SystemDefinition, SystemDefinition] {
  return createSystems(
    {
      avariaUrl: import.meta.env.VITE_AVARIA_URL,
      machlavaUrl: import.meta.env.VITE_MACHLAVA_URL,
    },
    window.location.href,
  )
}
