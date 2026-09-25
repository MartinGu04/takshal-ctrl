/**
 * Adds resource hints for destination origins so the handoff to a system
 * starts warm. Hints are only added once per origin and never for our own.
 */

const added = new Set<string>()

export function hintOrigin(origin: string, rel: 'dns-prefetch' | 'preconnect'): void {
  if (origin === window.location.origin) return
  const key = `${rel}:${origin}`
  if (added.has(key)) return
  added.add(key)

  const link = document.createElement('link')
  link.rel = rel
  link.href = origin
  document.head.appendChild(link)
}
