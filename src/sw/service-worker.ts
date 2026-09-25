/// <reference lib="webworker" />
/**
 * TAKSHAL CTRL service worker. Owns the Web Push subscription for Avaria and המחלבה.
 *
 * Deliberately push-only: no fetch handler and no offline caching, so a new version can
 * activate immediately without serving stale content.
 */

import { buildNotification, pickClientToFocus, resolveClickUrl } from './logic'

declare const self: ServiceWorkerGlobalScope
declare const __SW_VERSION__: string
declare const __VAPID_PUBLIC_KEY__: string

/** Cache names this version owns (none today). Anything else under our prefix is removed. */
const CACHE_PREFIX = 'takshal-'
const OWNED_CACHES = new Set<string>()

self.addEventListener('install', () => {
  // Safe because nothing is cached: activating a new version cannot mix old and new assets.
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && !OWNED_CACHES.has(name)).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('push', (event) => {
  let text: string | null = null
  try {
    text = event.data?.text() ?? null
  } catch {
    text = null
  }
  const { title, options } = buildNotification(text)
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = resolveClickUrl(event.notification.data, self.location.origin)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = pickClientToFocus(windows, self.location.origin)
      if (existing) {
        try {
          const navigated = await existing.navigate(url)
          await (navigated ?? existing).focus()
          return
        } catch {
          // navigate() is only allowed for controlled clients; fall through to a new window.
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})

interface PushSubscriptionChangeEvent extends ExtendableEvent {
  readonly oldSubscription: PushSubscription | null
  readonly newSubscription: PushSubscription | null
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// The push service rotated this device's subscription: re-subscribe and move the record server-side.
self.addEventListener('pushsubscriptionchange', ((event: PushSubscriptionChangeEvent) => {
  event.waitUntil(
    (async () => {
      const oldEndpoint = event.oldSubscription?.endpoint
      if (!oldEndpoint || !__VAPID_PUBLIC_KEY__) return
      const next =
        event.newSubscription ??
        (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(__VAPID_PUBLIC_KEY__) }))
      await fetch('/api/push/rotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ oldEndpoint, subscription: next.toJSON() }),
        credentials: 'omit',
      })
    })().catch(() => undefined),
  )
}) as EventListener)

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.ports[0]?.postMessage(__SW_VERSION__)
})
