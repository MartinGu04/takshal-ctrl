/**
 * The single place TAKSHAL CTRL knows anything about the systems it fronts.
 *
 * Avaria and המחלבה are independent applications. The portal only needs a
 * display identity and an entry URL for each; URLs come from the environment
 * (see `.env.example`) so they can change without touching any component.
 */

import { resolveDestination, type Destination } from './destination'

export type SystemId = 'avaria' | 'machlava'

export interface SystemDefinition {
  readonly id: SystemId
  /** Display name, rendered as the world's headline. */
  readonly name: string
  /** Language of the display name, for correct pronunciation and shaping. */
  readonly nameLang: 'en' | 'he'
  /** Small technical label above the headline. */
  readonly designation: string
  /** One short supporting line. Keep it brief — the page should read instantly. */
  readonly tagline: string
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
      name: 'AVARIA',
      nameLang: 'en',
      designation: 'SYS·01 — DIAGNOSTICS',
      tagline: 'תקלות, אבחון והתראות — במבט אחד.',
      ctaLabel: 'כניסה ל־Avaria',
      destination: resolveDestination(sources.avariaUrl, base),
    },
    {
      id: 'machlava',
      name: 'המחלבה',
      nameLang: 'he',
      designation: 'SYS·02 — SATCOM LINK',
      tagline: 'תקשורת, תיאום ושליטה — בערוץ אחד.',
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
