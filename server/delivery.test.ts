// @vitest-environment node
import { createNotificationPayload } from '../src/shared/notifications/payload.js'
import { deliver, DISABLE_AFTER_FAILURES } from './delivery.js'
import { fakeSender, subscriptionJson } from './testing/fixtures.js'
import { memoryStore } from './testing/memoryStore.js'
import { validateSubscription } from './validation.js'

const NOW = Date.parse('2026-09-25T12:00:00Z')
const payload = createNotificationPayload({ source: 'avaria', title: 'תקלה', body: 'פרטים', target: '/incident/1' })

async function seed(endpoint: string, expiration: number | null = null) {
  const { store, rows } = memoryStore(() => NOW)
  const parsed = validateSubscription({ ...subscriptionJson(endpoint), expirationTime: expiration })
  if (!parsed.ok) throw new Error(parsed.error)
  await store.upsert('user-alice', parsed.value, null)
  return { store, rows }
}

describe('delivery', () => {
  it.each([404, 410])('deletes subscriptions the push service reports as gone (%i)', async (status) => {
    const { store, rows } = await seed('https://fcm.googleapis.com/fcm/send/dead')
    const { sender } = fakeSender(() => ({ kind: 'gone', status }))
    const report = await deliver([...rows.values()], payload, { store, sender, now: () => NOW })
    expect(report).toEqual({ delivered: 0, failed: 0, removed: 1 })
    expect(rows.size).toBe(0)
  })

  it('disables a subscription after repeated transient failures instead of retrying forever', async () => {
    const { store, rows } = await seed('https://fcm.googleapis.com/fcm/send/flaky')
    const { sender } = fakeSender(() => ({ kind: 'failed', status: 500 }))
    for (let i = 0; i < DISABLE_AFTER_FAILURES; i++) await deliver(await store.listEnabledForUser('user-alice'), payload, { store, sender, now: () => NOW })
    expect([...rows.values()][0]).toMatchObject({ enabled: false, failureCount: DISABLE_AFTER_FAILURES })
    expect(await store.listEnabledForUser('user-alice')).toHaveLength(0)
  })

  it('resets the failure count after a success', async () => {
    const { store, rows } = await seed('https://fcm.googleapis.com/fcm/send/ok')
    let fail = true
    const { sender } = fakeSender(() => (fail ? { kind: 'failed', status: 503 } : { kind: 'delivered' }))
    await deliver([...rows.values()], payload, { store, sender, now: () => NOW })
    fail = false
    await deliver([...rows.values()], payload, { store, sender, now: () => NOW })
    expect([...rows.values()][0]).toMatchObject({ failureCount: 0, enabled: true })
  })

  it('drops expired subscriptions without sending', async () => {
    const { store, rows } = await seed('https://fcm.googleapis.com/fcm/send/expired', NOW - 1000)
    const { sender, sent } = fakeSender()
    expect(await deliver([...rows.values()], payload, { store, sender, now: () => NOW })).toEqual({ delivered: 0, failed: 0, removed: 1 })
    expect(sent).toHaveLength(0)
  })

  it('sends exactly the validated payload', async () => {
    const { store, rows } = await seed('https://fcm.googleapis.com/fcm/send/a')
    const { sender, sent } = fakeSender()
    await deliver([...rows.values()], payload, { store, sender, now: () => NOW })
    expect(sent[0]!.payload).toEqual(payload)
  })
})
