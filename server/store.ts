/** Persistence boundary for push subscriptions and notification events. */

import type { NotificationSource } from '../src/shared/notifications/sources.js'
import type { PushSubscriptionInput } from './validation.js'

export interface StoredSubscription {
  readonly id: string
  readonly userId: string
  readonly endpoint: string
  readonly p256dh: string
  readonly auth: string
  readonly expirationTime: string | null
  readonly deviceLabel: string | null
  readonly enabled: boolean
  readonly failureCount: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface NotificationEvent {
  readonly userId: string
  readonly source: NotificationSource
  readonly kind: 'test' | 'source'
  readonly delivered: number
  readonly failed: number
  readonly removed: number
}

/** Identifies one source notification: `(source, eventId)` is delivered at most once. */
export interface SourceEventKey {
  readonly source: NotificationSource
  readonly eventId: string
}

export interface SourceEventClaim extends SourceEventKey {
  readonly userId: string
  /** An unfinished claim older than this may be taken over (the earlier attempt crashed). */
  readonly leaseSeconds: number
}

export interface SubscriptionStore {
  /**
   * Inserts or updates by endpoint (endpoints are unique). An endpoint re-registered by a
   * different user moves to that user: holding the live endpoint proves control of the device.
   */
  upsert(userId: string, subscription: PushSubscriptionInput, deviceLabel: string | null): Promise<{ record: StoredSubscription; created: boolean }>
  findByEndpoint(endpoint: string): Promise<StoredSubscription | null>
  listEnabledForUser(userId: string): Promise<StoredSubscription[]>
  countForUser(userId: string): Promise<number>
  /** Deletes only if owned by the user. Returns whether a row was removed. */
  deleteForUser(userId: string, endpoint: string): Promise<boolean>
  deleteById(id: string): Promise<void>
  /** Replaces a subscription's endpoint/keys in place (push service rotation). */
  replace(id: string, subscription: PushSubscriptionInput): Promise<StoredSubscription>
  recordSuccess(id: string): Promise<void>
  /** Increments the failure count; disables the subscription at `disableAfter` consecutive failures. */
  recordFailure(id: string, disableAfter: number): Promise<void>
  recordEvent(event: NotificationEvent): Promise<void>
  countEventsSince(userId: string, kind: NotificationEvent['kind'], sinceIso: string): Promise<number>

  /**
   * Records `email` (normalized, verified by Supabase Auth) as `userId`'s recipient address for
   * trusted sources. An address maps to at most one user: the latest verified session wins.
   */
  rememberRecipient(userId: string, email: string): Promise<void>
  /** The user a normalized verified email belongs to, or null. */
  findRecipientUserId(email: string): Promise<string | null>
  /**
   * Atomically claims a source event for delivery. False when it was already claimed (a retry or
   * a concurrent duplicate) — unless the earlier claim never completed within its lease.
   */
  claimSourceEvent(claim: SourceEventClaim): Promise<boolean>
  /** Marks a claimed source event as delivered, with its outcome counts. */
  completeSourceEvent(key: SourceEventKey, report: { delivered: number; failed: number; removed: number }): Promise<void>
}
