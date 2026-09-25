/**
 * Supabase API key model.
 *
 * TAKSHAL CTRL uses Supabase's publishable / secret keys (not the legacy JWT-based
 * `anon` / `service_role` keys):
 *   - publishable key (`sb_publishable_…`) — safe in the browser; acts as the Postgres `anon` role.
 *   - secret key (`sb_secret_…`) — server only; acts as the Postgres `service_role` role.
 *
 * Environment-neutral (no DOM, no Node APIs) so the page, the server and the build can share it.
 */

export const PUBLISHABLE_KEY_PREFIX = 'sb_publishable_'
export const SECRET_KEY_PREFIX = 'sb_secret_'

const KEY_BODY = /^[A-Za-z0-9_-]+$/

function hasPrefix(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && value.startsWith(prefix) && value.length > prefix.length && KEY_BODY.test(value.slice(prefix.length))
}

export function isPublishableKey(value: unknown): value is string {
  return hasPrefix(value, PUBLISHABLE_KEY_PREFIX)
}

export function isSecretKey(value: unknown): value is string {
  return hasPrefix(value, SECRET_KEY_PREFIX)
}

/** A legacy JWT-style API key (three base64url segments, e.g. the old anon / service_role keys). */
export function isLegacyJwtKey(value: unknown): value is string {
  return typeof value === 'string' && /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
}

function legacyJwtRole(value: string): string | null {
  try {
    const segment = value.split('.')[1] ?? ''
    const base64 = (segment + '='.repeat((4 - (segment.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(base64)) as { role?: unknown }
    return typeof claims.role === 'string' ? claims.role : null
  } catch {
    return null
  }
}

/** True for any value that grants server-level (service_role) access, in either key model. */
export function isPrivilegedKey(value: unknown): boolean {
  if (isSecretKey(value)) return true
  return isLegacyJwtKey(value) && legacyJwtRole(value) === 'service_role'
}

/**
 * Names of browser-exposed (`VITE_`-prefixed) variables that hold a secret: a privileged Supabase
 * key by value, or anything named as a secret (e.g. a source credential such as
 * `VITE_MACHLAVA_SOURCE_SECRET`). Such a value would be baked into the public bundle, so the
 * build refuses it.
 */
export function findClientExposedSecrets(env: Record<string, string | undefined>): string[] {
  return Object.entries(env)
    .filter(([name, value]) => name.startsWith('VITE_') && (isPrivilegedKey(value?.trim()) || (/SECRET/i.test(name) && Boolean(value?.trim()))))
    .map(([name]) => name)
}
