/**
 * Validation for notification click targets.
 *
 * A target is only ever a *relative path inside a known system*. The final external URL is
 * always built from the centrally configured base URL, so a notification can never become an
 * open redirect.
 */

export const MAX_TARGET_LENGTH = 512

// Printable ASCII only: no whitespace/control characters (which URL parsers silently strip),
// no backslashes (which some parsers treat as slashes).
const SAFE_TARGET = /^\/[\x21-\x5b\x5d-\x7e]*$/

export function isSafeRelativeTarget(target: unknown): target is string {
  if (typeof target !== 'string') return false
  if (target.length === 0 || target.length > MAX_TARGET_LENGTH) return false
  if (!SAFE_TARGET.test(target)) return false
  // Protocol-relative ("//host") would leave the origin.
  if (target.startsWith('//')) return false

  // Belt and braces: resolving against a sentinel origin must stay on that origin.
  try {
    const sentinel = 'https://target.invalid'
    return new URL(target, sentinel).origin === sentinel
  } catch {
    return false
  }
}

/**
 * Joins a validated relative target onto a trusted base URL. Returns null if the target is not
 * safe or would escape the base URL's origin.
 */
export function buildDestinationUrl(base: string, target?: string | null): string | null {
  let baseUrl: URL
  try {
    baseUrl = new URL(base)
  } catch {
    return null
  }
  if (baseUrl.protocol !== 'https:' && baseUrl.protocol !== 'http:') return null
  if (target === undefined || target === null || target === '') return baseUrl.href
  if (!isSafeRelativeTarget(target)) return null

  const url = new URL(target, baseUrl)
  return url.origin === baseUrl.origin ? url.href : null
}
