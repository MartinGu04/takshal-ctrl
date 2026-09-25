/** In-memory SubscriptionStore with the same semantics as the Supabase store. Tests only. */

import type { NotificationEvent, StoredSubscription, SubscriptionStore } from '../store.js'

export interface MemoryEvent extends NotificationEvent {
  readonly createdAt: string
  /** Source events only. */
  readonly eventId?: string
  readonly status?: 'processing' | 'completed'
  readonly claimedAt?: string
}

export function memoryStore(clock: () => number = Date.now) {
  const rows = new Map<string, StoredSubscription>()
  const events: MemoryEvent[] = []
  /** user id → normalized verified email (the `notification_recipients` table). */
  const recipients = new Map<string, string>()
  let seq = 0
  const iso = () => new Date(clock()).toISOString()
  const byEndpoint = (endpoint: string) => [...rows.values()].find((row) => row.endpoint === endpoint) ?? null
  const update = (id: string, patch: Partial<StoredSubscription>) => {
    const row = rows.get(id)
    if (!row) return null
    const next = { ...row, ...patch, updatedAt: iso() }
    rows.set(id, next)
    return next
  }

  const store: SubscriptionStore = {
    async upsert(userId, subscription, deviceLabel) {
      const existing = byEndpoint(subscription.endpoint)
      if (existing) {
        const record = update(existing.id, {
          userId,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          expirationTime: subscription.expirationTime,
          deviceLabel,
          enabled: true,
          failureCount: 0,
        })!
        return { record, created: false }
      }
      const record: StoredSubscription = {
        id: `sub-${++seq}`,
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        expirationTime: subscription.expirationTime,
        deviceLabel,
        enabled: true,
        failureCount: 0,
        createdAt: iso(),
        updatedAt: iso(),
      }
      rows.set(record.id, record)
      return { record, created: true }
    },
    async findByEndpoint(endpoint) {
      return byEndpoint(endpoint)
    },
    async listEnabledForUser(userId) {
      return [...rows.values()].filter((row) => row.userId === userId && row.enabled)
    },
    async countForUser(userId) {
      return [...rows.values()].filter((row) => row.userId === userId).length
    },
    async deleteForUser(userId, endpoint) {
      const row = byEndpoint(endpoint)
      if (!row || row.userId !== userId) return false
      return rows.delete(row.id)
    },
    async deleteById(id) {
      rows.delete(id)
    },
    async replace(id, subscription) {
      return update(id, { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth, expirationTime: subscription.expirationTime, enabled: true, failureCount: 0 })!
    },
    async recordSuccess(id) {
      update(id, { failureCount: 0 })
    },
    async recordFailure(id, disableAfter) {
      const row = rows.get(id)
      if (!row) return
      const failureCount = row.failureCount + 1
      update(id, { failureCount, enabled: failureCount >= disableAfter ? false : row.enabled })
    },
    async recordEvent(event) {
      events.push({ ...event, createdAt: iso() })
    },
    async countEventsSince(userId, kind, sinceIso) {
      return events.filter((event) => event.userId === userId && event.kind === kind && event.createdAt >= sinceIso).length
    },
    async rememberRecipient(userId, email) {
      for (const [otherUserId, otherEmail] of recipients) if (otherEmail === email && otherUserId !== userId) recipients.delete(otherUserId)
      recipients.set(userId, email)
    },
    async findRecipientUserId(email) {
      for (const [userId, recipientEmail] of recipients) if (recipientEmail === email) return userId
      return null
    },
    // No await between the lookup and the write: atomic, like the SQL function.
    async claimSourceEvent({ source, eventId, userId, leaseSeconds }) {
      const index = events.findIndex((event) => event.source === source && event.eventId === eventId)
      if (index === -1) {
        events.push({ userId, source, kind: 'source', delivered: 0, failed: 0, removed: 0, createdAt: iso(), eventId, status: 'processing', claimedAt: iso() })
        return true
      }
      const existing = events[index]!
      const expired = existing.status === 'processing' && Date.parse(existing.claimedAt!) < clock() - leaseSeconds * 1000
      if (!expired) return false
      events[index] = { ...existing, userId, claimedAt: iso() }
      return true
    },
    async completeSourceEvent({ source, eventId }, report) {
      const index = events.findIndex((event) => event.source === source && event.eventId === eventId)
      if (index !== -1) events[index] = { ...events[index]!, ...report, status: 'completed' }
    },
  }

  return { store, rows, events, recipients }
}
