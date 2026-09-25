/** Delivers a notification to a user's devices and keeps the subscription list healthy. */

import type { NotificationPayloadV1 } from '../src/shared/notifications/payload.js'
import type { PushSender } from './sender.js'
import type { StoredSubscription, SubscriptionStore } from './store.js'
import { endpointFingerprint } from './validation.js'

/** Consecutive non-permanent failures after which a subscription is disabled (not retried forever). */
export const DISABLE_AFTER_FAILURES = 5

export interface DeliveryReport {
  readonly delivered: number
  readonly failed: number
  readonly removed: number
}

export interface DeliveryDeps {
  readonly store: SubscriptionStore
  readonly sender: PushSender
  readonly log?: (message: string) => void
  readonly now?: () => number
}

export async function deliver(subscriptions: readonly StoredSubscription[], payload: NotificationPayloadV1, deps: DeliveryDeps): Promise<DeliveryReport> {
  const now = deps.now?.() ?? Date.now()
  const body = JSON.stringify(payload)
  let delivered = 0
  let failed = 0
  let removed = 0

  await Promise.all(
    subscriptions.map(async (subscription) => {
      if (subscription.expirationTime && Date.parse(subscription.expirationTime) <= now) {
        await deps.store.deleteById(subscription.id)
        removed++
        return
      }

      const outcome = await deps.sender.send(subscription, body, {
        ttlSeconds: 60 * 60 * 24,
        urgency: payload.source === 'system' ? 'normal' : 'high',
        ...(payload.tag ? { topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined } : {}),
      })

      if (outcome.kind === 'delivered') {
        delivered++
        await deps.store.recordSuccess(subscription.id)
      } else if (outcome.kind === 'gone') {
        removed++
        await deps.store.deleteById(subscription.id)
        deps.log?.(`push: removed dead subscription ${endpointFingerprint(subscription.endpoint)} (${outcome.status})`)
      } else {
        failed++
        await deps.store.recordFailure(subscription.id, DISABLE_AFTER_FAILURES)
        deps.log?.(`push: delivery failed for ${endpointFingerprint(subscription.endpoint)} (${outcome.status ?? 'network'})`)
      }
    }),
  )

  return { delivered, failed, removed }
}
