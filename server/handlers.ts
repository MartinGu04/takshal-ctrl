/**
 * TAKSHAL CTRL Notification Hub — HTTP handlers (Web-standard Request → Response).
 *
 * Every mutation is authenticated and scoped to the session user; the browser never names a
 * recipient. There is intentionally no public "send" endpoint: the only way to notify someone
 * else is the server-to-server source ingress (`handleSourceNotify`), authenticated by a
 * per-source secret that never reaches a browser.
 */

import { createNotificationPayload } from '../src/shared/notifications/payload.js'
import { authenticate, type AuthenticatedUser, type Authenticator } from './auth.js'
import { deliver } from './delivery.js'
import { errors, HttpError, json, readJsonObject } from './http.js'
import type { PushSender } from './sender.js'
import { eventFingerprint, hasValidSourceCredential, parseSourceNotifyRequest, type SourceId, type SourceSecrets } from './source.js'
import type { SubscriptionStore } from './store.js'
import { sanitizeDeviceLabel, validateEndpoint, validateSubscription } from './validation.js'

export interface HubDeps {
  readonly authenticator: Authenticator
  readonly store: SubscriptionStore
  readonly sender: PushSender
  /** Server-only credentials of the trusted source systems. A source without one is rejected. */
  readonly sourceSecrets?: SourceSecrets
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

/**
 * Keeps the verified email → user mapping that trusted sources address recipients by. Refreshed
 * from the verified session on every status/subscribe call, so an already-enrolled user acquires
 * it on their next visit. Best effort: it never fails the user's own request.
 */
async function rememberRecipient(user: AuthenticatedUser, deps: HubDeps): Promise<void> {
  if (!user.verifiedEmail) return
  try {
    await deps.store.rememberRecipient(user.id, user.verifiedEmail)
  } catch {
    deps.log?.('hub: recipient mapping refresh failed')
  }
}

/** POST /api/push/subscribe — register or refresh this device for the session user. */
export const handleSubscribe = authenticated(async (_request, user, body, deps) => {
  const subscription = validateSubscription(body.subscription)
  if (!subscription.ok) return errors.badRequest(subscription.error)
  await rememberRecipient(user, deps)

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
  await rememberRecipient(user, deps)
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

/** Source notifications per recipient: a runaway source cannot flood anyone's devices. */
export const SOURCE_RATE_LIMIT = { max: 30, windowSeconds: 10 * 60 } as const

/**
 * How long an unfinished claim blocks retries. Longer than any single delivery can take (web-push
 * times out each send after 10 s, sends run in parallel), so a live attempt is never doubled; a
 * crashed one is retried by the source's next attempt after this.
 */
export const SOURCE_EVENT_LEASE_SECONDS = 120

/**
 * POST /api/source/<source>/notify — server-to-server ingress for a trusted source system.
 *
 * The source is fixed by the route and proven by its own secret; the body can never choose it,
 * an icon, or a URL. The recipient is addressed by verified email and resolved through
 * `notification_recipients`. `(source, eventId)` is delivered at most once, so a retried or
 * concurrently duplicated request never pushes twice.
 *
 * Responses never reveal more than the source needs: an unknown address and a user with no
 * active device answer identically (`reason: "no_active_subscription"`), which is not an error.
 */
export function handleSourceNotify(source: SourceId) {
  return async (request: Request, deps: HubDeps | null): Promise<Response> => {
    if (request.method !== 'POST') return errors.methodNotAllowed('POST')
    if (!deps) return errors.unavailable()
    try {
      if (!hasValidSourceCredential(request, deps.sourceSecrets?.[source])) {
        deps.log?.(`source: ${source} rejected: unauthorized`)
        return errors.unauthorized()
      }
      const parsed = parseSourceNotifyRequest(source, await readJsonObject(request))
      if (!parsed.ok) {
        deps.log?.(`source: ${source} rejected: ${parsed.error}`)
        return errors.badRequest(parsed.error)
      }
      const notification = parsed.value
      const event = eventFingerprint(notification.eventId)

      const userId = await deps.store.findRecipientUserId(notification.recipientEmail)
      const targets = userId ? await deps.store.listEnabledForUser(userId) : []
      if (!userId || targets.length === 0) {
        deps.log?.(`source: ${source} event ${event} no_active_subscription`)
        return json(200, { accepted: true, delivered: 0, reason: 'no_active_subscription' })
      }

      const now = deps.now?.() ?? Date.now()
      const since = new Date(now - SOURCE_RATE_LIMIT.windowSeconds * 1000).toISOString()
      if ((await deps.store.countEventsSince(userId, 'source', since)) >= SOURCE_RATE_LIMIT.max) {
        deps.log?.(`source: ${source} event ${event} rate_limited`)
        return errors.tooManyRequests(SOURCE_RATE_LIMIT.windowSeconds)
      }

      const key = { source, eventId: notification.eventId }
      if (!(await deps.store.claimSourceEvent({ ...key, userId, leaseSeconds: SOURCE_EVENT_LEASE_SECONDS }))) {
        deps.log?.(`source: ${source} event ${event} duplicate`)
        return json(200, { accepted: true, duplicate: true, delivered: 0 })
      }

      const payload = createNotificationPayload({
        source,
        title: notification.title,
        body: notification.body,
        target: notification.target,
        ...(notification.tag ? { tag: notification.tag } : {}),
        timestamp: notification.timestamp ?? now,
      })
      const report = await deliver(targets, payload, { store: deps.store, sender: deps.sender, log: deps.log, now: () => now })
      await deps.store.completeSourceEvent(key, report)
      deps.log?.(`source: ${source} event ${event} delivered=${report.delivered} failed=${report.failed} removed=${report.removed}`)
      return json(200, { accepted: true, ...report })
    } catch (error) {
      if (error instanceof HttpError) return error.response
      deps.log?.(`hub: unexpected error ${(error as Error)?.name ?? 'unknown'}`)
      return errors.internal()
    }
  }
}

/** POST /api/source/machlava/notify — המחלבה's ingress. */
export const handleMachlavaNotify = handleSourceNotify('machlava')
