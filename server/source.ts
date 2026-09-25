/**
 * Trusted source systems (server-to-server): credentials and the versioned notify request.
 *
 * A source is identified by the credential it presents on its own route, never by anything in
 * the request body. Each source has its own secret, so a leaked credential for one source can
 * never send as another.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { parseNotificationPayload } from '../src/shared/notifications/payload.js'
import type { SystemId } from '../src/shared/destinations.js'
import { bearerToken } from './http.js'
import { parseEmail } from './identity.js'
import type { Validated } from './validation.js'

/** Sources that may call the hub, with the server-only environment variable holding each one's secret. */
export const SOURCE_SECRET_ENV = {
  machlava: 'MACHLAVA_SOURCE_SECRET',
} as const satisfies Partial<Record<SystemId, string>>

export type SourceId = keyof typeof SOURCE_SECRET_ENV

export type SourceSecrets = Partial<Record<SourceId, string>>

/** Shorter secrets are treated as "not configured": the credential must not be guessable. */
export const MIN_SOURCE_SECRET_LENGTH = 32

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest()

/**
 * Constant-time check of `Authorization: Bearer <secret>` against the source's configured secret.
 * Both sides are hashed first so the comparison is fixed-length and reveals nothing about the
 * secret's length or content. A missing or too-short configured secret fails closed.
 */
export function hasValidSourceCredential(request: Request, expected: string | undefined): boolean {
  if (!expected || expected.length < MIN_SOURCE_SECRET_LENGTH) return false
  const provided = bearerToken(request)
  if (!provided) return false
  return timingSafeEqual(sha256(provided), sha256(expected))
}

// ───────────────────────── request schema (v1) ─────────────────────────

export const SOURCE_REQUEST_VERSION = 1

/** Stable, source-chosen idempotency key, e.g. `job:<uuid>`. */
const EVENT_ID = /^[A-Za-z0-9._:-]{1,128}$/

const ALLOWED_FIELDS: ReadonlySet<string> = new Set(['version', 'eventId', 'recipientEmail', 'title', 'body', 'target', 'tag', 'timestamp'])

export interface SourceNotifyRequest {
  readonly version: typeof SOURCE_REQUEST_VERSION
  readonly eventId: string
  /** Normalized. Resolved to a TAKSHAL CTRL user through `notification_recipients`. */
  readonly recipientEmail: string
  readonly title: string
  readonly body: string
  /** Safe relative path inside the source system; the hub owns the base URL. */
  readonly target: string
  readonly tag?: string
  readonly timestamp?: number
}

/**
 * Strict: unknown fields are rejected rather than ignored, so a payload can never smuggle in a
 * `source`, an `icon` or a URL. Text, target, tag and timestamp are validated by the same rules
 * as the Web Push payload itself (`parseNotificationPayload`), so nothing accepted here can fail
 * later.
 */
export function parseSourceNotifyRequest(source: SourceId, body: Record<string, unknown>): Validated<SourceNotifyRequest> {
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) return { ok: false, error: 'unknown-field' }
  if (body.version !== SOURCE_REQUEST_VERSION) return { ok: false, error: 'unsupported-version' }
  if (typeof body.eventId !== 'string' || !EVENT_ID.test(body.eventId)) return { ok: false, error: 'invalid-event-id' }

  const recipientEmail = parseEmail(body.recipientEmail)
  if (!recipientEmail) return { ok: false, error: 'invalid-recipient' }

  if (body.target === undefined || body.target === null) return { ok: false, error: 'missing-target' }

  const payload = parseNotificationPayload({
    v: 1,
    source,
    title: body.title,
    body: body.body,
    target: body.target,
    tag: body.tag,
    timestamp: body.timestamp,
  })
  if (!payload.ok) return payload

  const { title, body: text, target, tag } = payload.value
  return {
    ok: true,
    value: {
      version: SOURCE_REQUEST_VERSION,
      eventId: body.eventId,
      recipientEmail,
      title,
      body: text,
      target: target ?? '/',
      ...(tag ? { tag } : {}),
      ...(body.timestamp !== undefined ? { timestamp: payload.value.timestamp } : {}),
    },
  }
}

/** Safe identifier for logs: the event id's tail only. */
export function eventFingerprint(eventId: string): string {
  return `…${eventId.slice(-6)}`
}
