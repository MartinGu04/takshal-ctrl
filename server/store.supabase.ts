/** Supabase (Postgres) implementation of the subscription store, used with the service role key. */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotificationEvent, StoredSubscription, SubscriptionStore } from './store.js'
import type { PushSubscriptionInput } from './validation.js'

interface Row {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  expiration_time: string | null
  device_label: string | null
  enabled: boolean
  failure_count: number
  created_at: string
  updated_at: string
}

const COLUMNS = 'id,user_id,endpoint,p256dh,auth,expiration_time,device_label,enabled,failure_count,created_at,updated_at'

const toRecord = (row: Row): StoredSubscription => ({
  id: row.id,
  userId: row.user_id,
  endpoint: row.endpoint,
  p256dh: row.p256dh,
  auth: row.auth,
  expirationTime: row.expiration_time,
  deviceLabel: row.device_label,
  enabled: row.enabled,
  failureCount: row.failure_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

function check<T>(result: { data: T; error: { message: string } | null }): T {
  // Supabase errors can echo query values; keep them out of logs and responses.
  if (result.error) throw new Error('database-error')
  return result.data
}

function required<T>(result: { data: T | null; error: { message: string } | null }): T {
  const data = check(result)
  if (data === null) throw new Error('database-error')
  return data
}

export function supabaseStore(db: SupabaseClient): SubscriptionStore {
  const table = () => db.from('push_subscriptions')

  return {
    async upsert(userId, subscription, deviceLabel) {
      const existing = await this.findByEndpoint(subscription.endpoint)
      const row = required(
        await table()
          .upsert(
            {
              user_id: userId,
              endpoint: subscription.endpoint,
              p256dh: subscription.p256dh,
              auth: subscription.auth,
              expiration_time: subscription.expirationTime,
              device_label: deviceLabel,
              enabled: true,
              failure_count: 0,
            },
            { onConflict: 'endpoint' },
          )
          .select(COLUMNS)
          .single<Row>(),
      )
      return { record: toRecord(row), created: !existing }
    },

    async findByEndpoint(endpoint) {
      const row = check(await table().select(COLUMNS).eq('endpoint', endpoint).maybeSingle<Row>())
      return row ? toRecord(row) : null
    },

    async listEnabledForUser(userId) {
      const rows = check(await table().select(COLUMNS).eq('user_id', userId).eq('enabled', true).returns<Row[]>())
      return (rows ?? []).map(toRecord)
    },

    async countForUser(userId) {
      const { count, error } = await table().select('id', { count: 'exact', head: true }).eq('user_id', userId)
      if (error) throw new Error('database-error')
      return count ?? 0
    },

    async deleteForUser(userId, endpoint) {
      const rows = check(await table().delete().eq('user_id', userId).eq('endpoint', endpoint).select('id'))
      return (rows ?? []).length > 0
    },

    async deleteById(id) {
      check(await table().delete().eq('id', id))
    },

    async replace(id, subscription: PushSubscriptionInput) {
      const row = required(
        await table()
          .update({
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            expiration_time: subscription.expirationTime,
            enabled: true,
            failure_count: 0,
          })
          .eq('id', id)
          .select(COLUMNS)
          .single<Row>(),
      )
      return toRecord(row)
    },

    async recordSuccess(id) {
      check(await table().update({ failure_count: 0, last_success_at: new Date().toISOString() }).eq('id', id))
    },

    async recordFailure(id, disableAfter) {
      check(await db.rpc('push_subscription_record_failure', { subscription_id: id, disable_after: disableAfter }))
    },

    async recordEvent(event: NotificationEvent) {
      check(
        await db.from('notification_events').insert({
          user_id: event.userId,
          source: event.source,
          kind: event.kind,
          delivered: event.delivered,
          failed: event.failed,
          removed: event.removed,
        }),
      )
    },

    async countEventsSince(userId, kind, sinceIso) {
      const { count, error } = await db
        .from('notification_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('kind', kind)
        .gte('created_at', sinceIso)
      if (error) throw new Error('database-error')
      return count ?? 0
    },
  }
}
