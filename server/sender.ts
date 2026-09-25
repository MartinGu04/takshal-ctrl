/** Web Push delivery boundary. Tests replace this; production uses the `web-push` library. */

import webpush from 'web-push'
import type { StoredSubscription } from './store.js'

export type SendOutcome =
  | { readonly kind: 'delivered' }
  /** The push service says this subscription no longer exists (404/410): remove it. */
  | { readonly kind: 'gone'; readonly status: number }
  | { readonly kind: 'failed'; readonly status: number | null }

export interface PushSender {
  send(subscription: Pick<StoredSubscription, 'endpoint' | 'p256dh' | 'auth'>, payload: string, options: { ttlSeconds: number; urgency: 'normal' | 'high'; topic?: string }): Promise<SendOutcome>
}

export interface VapidConfig {
  readonly publicKey: string
  readonly privateKey: string
  readonly subject: string
}

export function webPushSender(vapid: VapidConfig): PushSender {
  return {
    async send(subscription, payload, options) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          {
            vapidDetails: vapid,
            TTL: options.ttlSeconds,
            urgency: options.urgency,
            ...(options.topic ? { topic: options.topic } : {}),
            timeout: 10_000,
          },
        )
        return { kind: 'delivered' }
      } catch (error) {
        const status = typeof (error as { statusCode?: unknown }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : null
        if (status === 404 || status === 410) return { kind: 'gone', status }
        return { kind: 'failed', status }
      }
    },
  }
}
