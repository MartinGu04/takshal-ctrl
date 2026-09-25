/**
 * Validation of browser-supplied PushSubscriptions.
 *
 * The hub later POSTs to the subscription endpoint, so endpoints are restricted to the known
 * Web Push services (prevents the hub from being used to reach arbitrary hosts).
 */

export interface PushSubscriptionInput {
  readonly endpoint: string
  readonly p256dh: string
  readonly auth: string
  readonly expirationTime: string | null
}

/** Hostname suffixes of the Web Push services used by current browsers. */
export const PUSH_SERVICE_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Edge (Chromium), Opera, Brave, Samsung Internet, Android
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari (macOS, iOS/iPadOS Home Screen apps)
  'notify.windows.com', // legacy Edge / Windows
] as const

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/

function decodedLength(base64url: string): number {
  const unpadded = base64url.replace(/=+$/, '')
  return Math.floor((unpadded.length * 3) / 4)
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

export type Validated<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }

export function validateEndpoint(value: unknown): Validated<string> {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return { ok: false, error: 'invalid-endpoint' }
  if (!isAllowedPushEndpoint(value)) return { ok: false, error: 'unsupported-push-service' }
  return { ok: true, value }
}

/** Accepts the JSON form of a PushSubscription (`subscription.toJSON()`). */
export function validateSubscription(value: unknown): Validated<PushSubscriptionInput> {
  if (typeof value !== 'object' || value === null) return { ok: false, error: 'invalid-subscription' }
  const raw = value as { endpoint?: unknown; keys?: unknown; expirationTime?: unknown }

  const endpoint = validateEndpoint(raw.endpoint)
  if (!endpoint.ok) return endpoint

  if (typeof raw.keys !== 'object' || raw.keys === null) return { ok: false, error: 'invalid-keys' }
  const { p256dh, auth } = raw.keys as { p256dh?: unknown; auth?: unknown }
  // p256dh: uncompressed P-256 public key (65 bytes). auth: 16-byte secret.
  if (typeof p256dh !== 'string' || !BASE64URL.test(p256dh) || decodedLength(p256dh) !== 65) {
    return { ok: false, error: 'invalid-keys' }
  }
  if (typeof auth !== 'string' || !BASE64URL.test(auth) || decodedLength(auth) !== 16) return { ok: false, error: 'invalid-keys' }

  let expirationTime: string | null = null
  if (raw.expirationTime !== undefined && raw.expirationTime !== null) {
    if (typeof raw.expirationTime !== 'number' || !Number.isFinite(raw.expirationTime)) return { ok: false, error: 'invalid-expiration' }
    expirationTime = new Date(raw.expirationTime).toISOString()
  }

  return { ok: true, value: { endpoint: endpoint.value, p256dh, auth, expirationTime } }
}

/** Optional coarse device label ("iPhone · Home Screen"). Plain text, short, no markup. */
export function sanitizeDeviceLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const label = value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 64)
  return label || null
}

/** Safe identifier for logs: never log the endpoint itself (it is a delivery capability). */
export function endpointFingerprint(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    return `${url.hostname}…${endpoint.slice(-6)}`
  } catch {
    return 'invalid'
  }
}
