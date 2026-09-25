/**
 * Resolves a configured destination string into a safe, navigable URL.
 *
 * The portal never trusts configuration blindly: only http(s) targets are
 * allowed, so a typo or a `javascript:` value can never become a live link.
 */

export type Destination =
  | { readonly ok: true; readonly href: string; readonly origin: string; readonly host: string }
  | { readonly ok: false; readonly reason: 'missing' | 'invalid' | 'unsafe-protocol' }

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function resolveDestination(raw: string | undefined, base: string): Destination {
  const value = raw?.trim()
  if (!value) return { ok: false, reason: 'missing' }

  let url: URL
  try {
    url = new URL(value, base)
  } catch {
    return { ok: false, reason: 'invalid' }
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { ok: false, reason: 'unsafe-protocol' }

  return { ok: true, href: url.href, origin: url.origin, host: url.host }
}
