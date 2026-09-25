/**
 * Production entry points of the two systems. Environment-neutral (no DOM, no assets), so the
 * page, the service worker and the server can all import it.
 *
 * The page may override these at build time with VITE_AVARIA_URL / VITE_MACHLAVA_URL.
 */
export const DEFAULT_DESTINATIONS = {
  avaria: 'https://takalot.vercel.app/',
  machlava: 'https://luzly.vercel.app/',
} as const

export type SystemId = keyof typeof DEFAULT_DESTINATIONS
