/**
 * Pure service-worker logic: turning a push message into a notification, and a notification
 * click into a same-origin URL. No payload content is ever executed or used as markup, and no
 * URL or icon is ever taken from the payload.
 */

import { handoffPathFor, isSameOriginPath } from '../shared/notifications/handoff'
import { parseNotificationPayload } from '../shared/notifications/payload'
import { SOURCE_BRANDING, type NotificationSource } from '../shared/notifications/sources'

export interface NotificationData {
  readonly url: string
  readonly source: NotificationSource
}

/** Structural subset of NotificationOptions (kept local so this file compiles in any lib). */
export interface BuiltNotificationOptions {
  body: string
  icon: string
  badge?: string
  tag?: string
  renotify?: boolean
  timestamp: number
  lang: 'he'
  dir: 'rtl' | 'auto'
  data: NotificationData
}

export interface BuiltNotification {
  readonly title: string
  readonly options: BuiltNotificationOptions
}

export const FALLBACK_NOTIFICATION: BuiltNotification = {
  title: 'TAKSHAL CTRL',
  options: {
    body: 'התקבלה התראה חדשה.',
    icon: SOURCE_BRANDING.system.icon,
    timestamp: 0,
    lang: 'he',
    dir: 'rtl',
    data: { url: '/', source: 'system' },
  },
}

/** Decodes push data text. Invalid or unknown payloads still produce a (generic) notification. */
export function buildNotification(text: string | null | undefined, now: number = Date.now()): BuiltNotification {
  let raw: unknown = null
  try {
    raw = text ? JSON.parse(text) : null
  } catch {
    raw = null
  }
  const parsed = parseNotificationPayload(raw)
  if (!parsed.ok) return { ...FALLBACK_NOTIFICATION, options: { ...FALLBACK_NOTIFICATION.options, timestamp: now } }

  const payload = parsed.value
  const brand = SOURCE_BRANDING[payload.source]
  // Some platforms (notably iOS) show only the app's own icon, so a source system also names
  // itself in the title.
  const title =
    payload.source === 'system' || payload.title.startsWith(brand.name) ? payload.title : `${brand.name} · ${payload.title}`

  return {
    title,
    options: {
      body: payload.body,
      icon: brand.icon,
      timestamp: payload.timestamp,
      lang: 'he',
      dir: 'rtl',
      ...(payload.tag ? { tag: payload.tag, renotify: true } : {}),
      data: { url: handoffPathFor(payload), source: payload.source },
    },
  }
}

/** The absolute same-origin URL a click should open. Anything unexpected falls back to the portal. */
export function resolveClickUrl(data: unknown, origin: string): string {
  const url = (data as Partial<NotificationData> | null)?.url
  return new URL(isSameOriginPath(url) ? url : '/', origin).href
}

/** Picks the window to reuse for a click: an existing TAKSHAL CTRL window on the same origin. */
export function pickClientToFocus<T extends { url: string }>(clients: readonly T[], origin: string): T | undefined {
  return clients.find((client) => {
    try {
      return new URL(client.url).origin === origin
    } catch {
      return false
    }
  })
}
