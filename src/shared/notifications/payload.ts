/**
 * Versioned notification payload: the only shape TAKSHAL CTRL sends over Web Push, and the
 * only shape its service worker renders. Everything is validated on both ends; unknown fields
 * (including any attempt to pass an `icon` or a URL) are dropped.
 */

import { isNotificationSource, type NotificationSource } from './sources.js'
import { isSafeRelativeTarget } from './targets.js'

export const PAYLOAD_VERSION = 1

export const LIMITS = {
  title: 120,
  body: 500,
  tag: 64,
} as const

export interface NotificationPayloadV1 {
  readonly v: typeof PAYLOAD_VERSION
  readonly source: NotificationSource
  readonly title: string
  readonly body: string
  /** Relative path within the source system, e.g. "/incident/123". Ignored for `system`. */
  readonly target?: string
  /** Groups/replaces notifications on the device. */
  readonly tag?: string
  /** Event time in ms since epoch. */
  readonly timestamp: number
}

const TAG_PATTERN = /^[A-Za-z0-9._:-]+$/

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  // Collapse control characters; notifications render text only, never markup.
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim()
  if (!text || text.length > max) return null
  return text
}

export function parseNotificationPayload(input: unknown): ParseResult<NotificationPayloadV1> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, error: 'not-an-object' }
  const raw = input as Record<string, unknown>

  if (raw.v !== PAYLOAD_VERSION) return { ok: false, error: 'unsupported-version' }
  if (!isNotificationSource(raw.source)) return { ok: false, error: 'unknown-source' }

  const title = cleanText(raw.title, LIMITS.title)
  if (!title) return { ok: false, error: 'invalid-title' }
  const body = cleanText(raw.body, LIMITS.body)
  if (!body) return { ok: false, error: 'invalid-body' }

  let target: string | undefined
  if (raw.target !== undefined && raw.target !== null) {
    if (raw.source === 'system') return { ok: false, error: 'system-target-not-allowed' }
    if (!isSafeRelativeTarget(raw.target)) return { ok: false, error: 'unsafe-target' }
    target = raw.target
  }

  let tag: string | undefined
  if (raw.tag !== undefined && raw.tag !== null) {
    if (typeof raw.tag !== 'string' || raw.tag.length > LIMITS.tag || !TAG_PATTERN.test(raw.tag)) {
      return { ok: false, error: 'invalid-tag' }
    }
    tag = raw.tag
  }

  let timestamp = Date.now()
  if (raw.timestamp !== undefined) {
    if (typeof raw.timestamp !== 'number' || !Number.isFinite(raw.timestamp) || raw.timestamp <= 0) {
      return { ok: false, error: 'invalid-timestamp' }
    }
    timestamp = Math.floor(raw.timestamp)
  }

  return {
    ok: true,
    value: { v: PAYLOAD_VERSION, source: raw.source, title, body, timestamp, ...(target ? { target } : {}), ...(tag ? { tag } : {}) },
  }
}

/** Builds a payload, throwing on invalid input. For server-side use with trusted callers. */
export function createNotificationPayload(input: Omit<NotificationPayloadV1, 'v' | 'timestamp'> & { timestamp?: number }): NotificationPayloadV1 {
  const result = parseNotificationPayload({ ...input, v: PAYLOAD_VERSION })
  if (!result.ok) throw new Error(`Invalid notification payload: ${result.error}`)
  return result.value
}
