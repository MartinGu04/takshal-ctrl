/**
 * TAKSHAL CTRL Notification Hub — HTTP handlers (Web-standard Request → Response).
 *
 * Every mutation is authenticated and scoped to the session user; the browser never names a
 * recipient. There is intentionally no public "send" endpoint.
 */

import { createNotificationPayload } from '../src/shared/notifications/payload.js'
import { authenticate, type AuthenticatedUser, type Authenticator } from './auth.js'
import { deliver } from './delivery.js'
import { errors, HttpError, json, readJsonObject } from './http.js'
import type { PushSender } from './sender.js'
import type { SubscriptionStore } from './store.js'
import { sanitizeDeviceLabel, validateEndpoint, validateSubscription } from './validation.js'

export interface HubDeps {
  readonly authenticator: Authenticator
  readonly store: SubscriptionStore
  readonly sender: PushSender
  readonly now?: () => number
  readonly log?: (message: string) => void
}

/** Test pushes: at most this many per user per window. */
export const TEST_RATE_LIMIT = { max: 5, windowSeconds: 10 * 60 } as const

/** Upper bound on devices per user, to keep one account from hoarding endpoints. */
export const MAX_DEVICES_PER_USER = 20

export const TEST_NOTIFICATION = {
  title: 'TAKSHAL CTRL',
  body: 'ההתראות מחוברות ועובדות.',
} as const

type Handler = (request: Request, user: AuthenticatedUser, body: Record<string, unknown>, deps: HubDeps) => Promise<Response>

/** Wraps a handler with: POST only, JSON body, authentication, error containment. */
function authenticated(handler: Handler) {
  return async (request: Request, deps: HubDeps | null): Promise<Response> => {
    if (request.method !== 'POST') return errors.methodNotAllowed('POST')
    if (!deps) return errors.unavailable()
    try {
      const user = await authenticate(request, deps.authenticator)
      if (!user) return errors.unauthorized()
      const body = await readJsonObject(request)
      return await handler(request, user, body, deps)
    } catch (error) {
      if (error instanceof HttpError) return error.response
      deps.log?.(`hub: unexpected error ${(error as Error)?.name ?? 'unknown'}`)
      return errors.internal()
    }
  }
}

/** POST /api/push/subscribe — register or refresh this device for the session user. */
export const handleSubscribe = authenticated(async (_request, user, body, deps) => {
  const subscription = validateSubscription(body.subscription)
  if (!subscription.ok) return errors.badRequest(subscription.error)

  const existing = await deps.store.findByEndpoint(subscription.value.endpoint)
  if (!existing || existing.userId !== user.id) {
    if ((await deps.store.countForUser(user.id)) >= MAX_DEVICES_PER_USER) return errors.forbidden('device-limit')
  }

  const { record, created } = await deps.store.upsert(user.id, subscription.value, sanitizeDeviceLabel(body.deviceLabel))
  return json(created ? 201 : 200, { subscription: { id: record.id, enabled: record.enabled, createdAt: record.createdAt } })
})

/** POST /api/push/unsubscribe — remove this device (only if it belongs to the session user). */
export const handleUnsubscribe = authenticated(async (_request, user, body, deps) => {
  const endpoint = validateEndpoint(body.endpoint)
  if (!endpoint.ok) return errors.badRequest(endpoint.error)
  const removed = await deps.store.deleteForUser(user.id, endpoint.value)
  return json(200, { removed })
})

/** POST /api/push/status — is this device registered for the session user, and how many devices are. */
export const handleStatus = authenticated(async (_request, user, body, deps) => {
  let registered = false
  if (body.endpoint !== undefined) {
    const endpoint = validateEndpoint(body.endpoint)
    if (!endpoint.ok) return errors.badRequest(endpoint.error)
    const record = await deps.store.findByEndpoint(endpoint.value)
    registered = Boolean(record && record.userId === user.id && record.enabled)
  }
  return json(200, { registered, devices: (await deps.store.listEnabledForUser(user.id)).length })
})

/**
 * POST /api/push/test — send the session user a test notification.
 * With `endpoint`, only that (owned) device; otherwise all of the user's devices. Rate limited.
 */
export const handleTest = authenticated(async (_request, user, body, deps) => {
  const now = deps.now?.() ?? Date.now()
  const since = new Date(now - TEST_RATE_LIMIT.windowSeconds * 1000).toISOString()
  if ((await deps.store.countEventsSince(user.id, 'test', since)) >= TEST_RATE_LIMIT.max) {
    return errors.tooManyRequests(TEST_RATE_LIMIT.windowSeconds)
  }

  let targets = await deps.store.listEnabledForUser(user.id)
  if (body.endpoint !== undefined) {
    const endpoint = validateEndpoint(body.endpoint)
    if (!endpoint.ok) return errors.badRequest(endpoint.error)
    targets = targets.filter((subscription) => subscription.endpoint === endpoint.value)
  }
  if (targets.length === 0) return errors.notFound()

  const payload = createNotificationPayload({ source: 'system', ...TEST_NOTIFICATION, tag: 'takshal-test', timestamp: now })
  const report = await deliver(targets, payload, { store: deps.store, sender: deps.sender, log: deps.log, now: () => now })
  await deps.store.recordEvent({ userId: user.id, source: 'system', kind: 'test', ...report })
  return json(200, report)
})

/**
 * POST /api/push/rotate — called by the service worker on `pushsubscriptionchange`.
 * Unauthenticated by necessity (no session inside the worker); authorised instead by
 * possession of the previous endpoint, which is a secret delivery capability. The new
 * subscription stays with the same user.
 */
export async function handleRotate(request: Request, deps: HubDeps | null): Promise<Response> {
  if (request.method !== 'POST') return errors.methodNotAllowed('POST')
  if (!deps) return errors.unavailable()
  try {
    const body = await readJsonObject(request)
    const previous = validateEndpoint(body.oldEndpoint)
    if (!previous.ok) return errors.badRequest(previous.error)
    const next = validateSubscription(body.subscription)
    if (!next.ok) return errors.badRequest(next.error)

    const record = await deps.store.findByEndpoint(previous.value)
    if (!record) return errors.notFound()
    const clash = await deps.store.findByEndpoint(next.value.endpoint)
    if (clash && clash.id !== record.id) {
      // The new endpoint is already registered; the old one is obsolete.
      await deps.store.deleteById(record.id)
      return json(200, { rotated: true })
    }
    await deps.store.replace(record.id, next.value)
    return json(200, { rotated: true })
  } catch (error) {
    if (error instanceof HttpError) return error.response
    deps.log?.(`hub: unexpected error ${(error as Error)?.name ?? 'unknown'}`)
    return errors.internal()
  }
}
