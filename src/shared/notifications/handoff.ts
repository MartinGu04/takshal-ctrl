/**
 * Notification click hand-off.
 *
 * The service worker only ever opens a same-origin TAKSHAL CTRL URL. The `/open` route then
 * validates the app identifier and target and builds the final destination from the trusted,
 * centrally configured base URL.
 */

import type { NotificationPayloadV1 } from './payload.js'
import { isSystemId } from './sources.js'
import { buildDestinationUrl, isSafeRelativeTarget } from './targets.js'
import type { SystemId } from '../destinations.js'

export const HANDOFF_PATH = '/open'

/** The same-origin path a notification click should open. */
export function handoffPathFor(payload: Pick<NotificationPayloadV1, 'source' | 'target'>): string {
  if (!isSystemId(payload.source)) return '/'
  const params = new URLSearchParams({ app: payload.source })
  if (payload.target && isSafeRelativeTarget(payload.target)) params.set('target', payload.target)
  return `${HANDOFF_PATH}?${params.toString()}`
}

/** Only same-origin paths are ever opened by the service worker. */
export function isSameOriginPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
}

export type HandoffResolution =
  | { readonly kind: 'external'; readonly app: SystemId; readonly url: string }
  | { readonly kind: 'portal' }
  | { readonly kind: 'invalid'; readonly reason: 'unknown-app' | 'unsafe-target' | 'no-destination' }

/**
 * Resolves `/open?app=…&target=…` against the trusted destination for each app.
 * `destinations` maps an app to its configured base URL (or null if not configured).
 */
export function resolveHandoff(search: string, destinations: Record<SystemId, string | null>): HandoffResolution {
  const params = new URLSearchParams(search)
  const app = params.get('app')
  if (app === null || app === '' || app === 'ctrl') return { kind: 'portal' }
  if (!isSystemId(app)) return { kind: 'invalid', reason: 'unknown-app' }

  const base = destinations[app]
  if (!base) return { kind: 'invalid', reason: 'no-destination' }

  const target = params.get('target')
  if (target !== null && target !== '' && !isSafeRelativeTarget(target)) return { kind: 'invalid', reason: 'unsafe-target' }

  const url = buildDestinationUrl(base, target)
  return url ? { kind: 'external', app, url } : { kind: 'invalid', reason: 'unsafe-target' }
}
