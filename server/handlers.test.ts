// @vitest-environment node
import { handleRotate, handleStatus, handleSubscribe, handleTest, handleUnsubscribe, MAX_DEVICES_PER_USER, TEST_RATE_LIMIT } from './handlers.js'
import { request, setupHub, subscriptionJson } from './testing/fixtures.js'

const ENDPOINT_A = 'https://fcm.googleapis.com/fcm/send/device-a'
const ENDPOINT_B = 'https://web.push.apple.com/QGdevice-b'

async function body(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

describe('hub: authentication', () => {
  it.each([
    ['subscribe', handleSubscribe, { subscription: subscriptionJson() }],
    ['unsubscribe', handleUnsubscribe, { endpoint: ENDPOINT_A }],
    ['status', handleStatus, {}],
    ['test', handleTest, {}],
  ] as const)('rejects unauthenticated %s', async (_name, handler, payload) => {
    const { deps, rows, sent } = setupHub()
    expect((await handler(request('/api/push/x', payload), deps)).status).toBe(401)
    expect((await handler(request('/api/push/x', payload, { token: 'forged' }), deps)).status).toBe(401)
    expect(rows.size).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('only accepts POST with a JSON body', async () => {
    const { deps } = setupHub()
    expect((await handleSubscribe(request('/api/push/subscribe', null, { method: 'GET', token: 'token-alice' }), deps)).status).toBe(405)
    expect((await handleSubscribe(request('/api/push/subscribe', 'x=1', { token: 'token-alice', contentType: 'application/x-www-form-urlencoded' }), deps)).status).toBe(415)
    expect((await handleSubscribe(request('/api/push/subscribe', '{nope', { token: 'token-alice' }), deps)).status).toBe(400)
    expect((await handleSubscribe(request('/api/push/subscribe', { x: 'y'.repeat(9000) }, { token: 'token-alice' }), deps)).status).toBe(413)
  })

  it('reports 503 when the hub is not configured', async () => {
    expect((await handleSubscribe(request('/api/push/subscribe', {}, { token: 'token-alice' }), null)).status).toBe(503)
  })
})

describe('hub: subscribe', () => {
  it('registers a device for the session user', async () => {
    const { deps, rows } = setupHub()
    const response = await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(), deviceLabel: 'iPhone · Home Screen' }, { token: 'token-alice' }), deps)
    expect(response.status).toBe(201)
    const data = await body(response)
    expect(JSON.stringify(data)).not.toContain(ENDPOINT_A) // endpoint never echoed back
    expect([...rows.values()]).toEqual([expect.objectContaining({ userId: 'user-alice', endpoint: ENDPOINT_A, deviceLabel: 'iPhone · Home Screen', enabled: true })])
  })

  it('deduplicates by endpoint (resubscribe updates in place)', async () => {
    const { deps, rows } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson() }, { token: 'token-alice' }), deps)
    const again = await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson() }, { token: 'token-alice' }), deps)
    expect(again.status).toBe(200)
    expect(rows.size).toBe(1)
  })

  it('supports multiple devices per user', async () => {
    const { deps, rows } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_A) }, { token: 'token-alice' }), deps)
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_B) }, { token: 'token-alice' }), deps)
    expect([...rows.values()].map((row) => row.userId)).toEqual(['user-alice', 'user-alice'])
  })

  it('moves an endpoint to whoever re-registers it from the device', async () => {
    const { deps, rows } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson() }, { token: 'token-alice' }), deps)
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson() }, { token: 'token-bob' }), deps)
    expect([...rows.values()]).toEqual([expect.objectContaining({ userId: 'user-bob' })])
  })

  it.each([
    [{}, 'invalid-subscription'],
    [{ subscription: { ...subscriptionJson(), endpoint: 'http://fcm.googleapis.com/x' } }, 'unsupported-push-service'],
    [{ subscription: { ...subscriptionJson(), endpoint: 'https://evil.example/push' } }, 'unsupported-push-service'],
    [{ subscription: { ...subscriptionJson(), endpoint: 'https://fcm.googleapis.com.evil.example/x' } }, 'unsupported-push-service'],
    [{ subscription: { ...subscriptionJson(), endpoint: 'https://user:pw@fcm.googleapis.com/x' } }, 'unsupported-push-service'],
    [{ subscription: { ...subscriptionJson(), keys: { p256dh: 'short', auth: 'x' } } }, 'invalid-keys'],
    [{ subscription: { ...subscriptionJson(), keys: undefined } }, 'invalid-keys'],
    [{ subscription: { ...subscriptionJson(), expirationTime: 'soon' } }, 'invalid-expiration'],
  ])('rejects malformed subscription %#', async (payload, error) => {
    const { deps, rows } = setupHub()
    const response = await handleSubscribe(request('/api/push/subscribe', payload, { token: 'token-alice' }), deps)
    expect(response.status).toBe(400)
    expect(await body(response)).toEqual({ error })
    expect(rows.size).toBe(0)
  })

  it('caps devices per user', async () => {
    const { deps } = setupHub()
    for (let i = 0; i < MAX_DEVICES_PER_USER; i++) {
      await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(`https://fcm.googleapis.com/fcm/send/d${i}`) }, { token: 'token-alice' }), deps)
    }
    const over = await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson('https://fcm.googleapis.com/fcm/send/extra') }, { token: 'token-alice' }), deps)
    expect(over.status).toBe(403)
  })

  it('sanitises the optional device label', async () => {
    const { deps, rows } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(), deviceLabel: '<script>x</script>'.repeat(10) }, { token: 'token-alice' }), deps)
    const label = [...rows.values()][0]!.deviceLabel!
    expect(label).not.toMatch(/[<>]/)
    expect(label.length).toBeLessThanOrEqual(64)
  })
})

describe('hub: unsubscribe', () => {
  it('removes the current device for its owner only', async () => {
    const { deps, rows } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson() }, { token: 'token-alice' }), deps)

    const byOther = await handleUnsubscribe(request('/api/push/unsubscribe', { endpoint: ENDPOINT_A }, { token: 'token-bob' }), deps)
    expect(await body(byOther)).toEqual({ removed: false })
    expect(rows.size).toBe(1)

    const byOwner = await handleUnsubscribe(request('/api/push/unsubscribe', { endpoint: ENDPOINT_A }, { token: 'token-alice' }), deps)
    expect(await body(byOwner)).toEqual({ removed: true })
    expect(rows.size).toBe(0)
  })

  it('validates the endpoint', async () => {
    const { deps } = setupHub()
    expect((await handleUnsubscribe(request('/api/push/unsubscribe', { endpoint: 'nope' }, { token: 'token-alice' }), deps)).status).toBe(400)
  })
})

describe('hub: status', () => {
  it('reports registration of this device and the user device count', async () => {
    const { deps } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_A) }, { token: 'token-alice' }), deps)
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_B) }, { token: 'token-alice' }), deps)
    expect(await body(await handleStatus(request('/api/push/status', { endpoint: ENDPOINT_A }, { token: 'token-alice' }), deps))).toEqual({ registered: true, devices: 2 })
    expect(await body(await handleStatus(request('/api/push/status', { endpoint: ENDPOINT_A }, { token: 'token-bob' }), deps))).toEqual({ registered: false, devices: 0 })
  })
})

describe('hub: test notification', () => {
  it('sends a branded test push to the session user’s current device only', async () => {
    const { deps, sent, events } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_A) }, { token: 'token-alice' }), deps)
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_B) }, { token: 'token-alice' }), deps)
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson('https://fcm.googleapis.com/fcm/send/bob') }, { token: 'token-bob' }), deps)

    const response = await handleTest(request('/api/push/test', { endpoint: ENDPOINT_B }, { token: 'token-alice' }), deps)
    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({ delivered: 1, failed: 0, removed: 0 })
    expect(sent).toEqual([
      {
        endpoint: ENDPOINT_B,
        payload: { v: 1, source: 'system', title: 'TAKSHAL CTRL', body: 'ההתראות מחוברות ועובדות.', tag: 'takshal-test', timestamp: Date.parse('2026-09-25T12:00:00Z') },
      },
    ])
    expect(events).toEqual([expect.objectContaining({ userId: 'user-alice', kind: 'test', source: 'system', delivered: 1 })])
  })

  it('sends to all of the user’s devices when no endpoint is given', async () => {
    const { deps, sent } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_A) }, { token: 'token-alice' }), deps)
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_B) }, { token: 'token-alice' }), deps)
    await handleTest(request('/api/push/test', {}, { token: 'token-alice' }), deps)
    expect(sent.map((item) => item.endpoint).sort()).toEqual([ENDPOINT_A, ENDPOINT_B].sort())
  })

  it('never lets the browser choose a recipient', async () => {
    const { deps, sent } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson('https://fcm.googleapis.com/fcm/send/bob') }, { token: 'token-bob' }), deps)
    // Alice names Bob's endpoint and user id; she has no devices of her own.
    const response = await handleTest(
      request('/api/push/test', { endpoint: 'https://fcm.googleapis.com/fcm/send/bob', userId: 'user-bob', email: 'bob@example.com' }, { token: 'token-alice' }),
      deps,
    )
    expect(response.status).toBe(404)
    expect(sent).toHaveLength(0)
  })

  it('is rate limited per user', async () => {
    const { deps } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson() }, { token: 'token-alice' }), deps)
    for (let i = 0; i < TEST_RATE_LIMIT.max; i++) {
      expect((await handleTest(request('/api/push/test', {}, { token: 'token-alice' }), deps)).status).toBe(200)
    }
    const limited = await handleTest(request('/api/push/test', {}, { token: 'token-alice' }), deps)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe(String(TEST_RATE_LIMIT.windowSeconds))
  })

  it('removes dead subscriptions reported gone by the push service', async () => {
    const { deps, rows, logs } = setupHub({ outcomeFor: (endpoint) => (endpoint === ENDPOINT_A ? { kind: 'gone', status: 410 } : { kind: 'delivered' }) })
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_A) }, { token: 'token-alice' }), deps)
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_B) }, { token: 'token-alice' }), deps)

    const response = await handleTest(request('/api/push/test', {}, { token: 'token-alice' }), deps)
    expect(await body(response)).toEqual({ delivered: 1, failed: 0, removed: 1 })
    expect([...rows.values()].map((row) => row.endpoint)).toEqual([ENDPOINT_B])
    expect(logs.join('\n')).not.toContain(ENDPOINT_A) // endpoints never logged
  })
})

describe('hub: subscription rotation', () => {
  it('moves the record to the new endpoint when the old one is presented', async () => {
    const { deps, rows } = setupHub()
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(ENDPOINT_A) }, { token: 'token-alice' }), deps)
    const response = await handleRotate(request('/api/push/rotate', { oldEndpoint: ENDPOINT_A, subscription: subscriptionJson(ENDPOINT_B) }), deps)
    expect(response.status).toBe(200)
    expect([...rows.values()]).toEqual([expect.objectContaining({ userId: 'user-alice', endpoint: ENDPOINT_B })])
  })

  it('rejects unknown previous endpoints and malformed input', async () => {
    const { deps, rows } = setupHub()
    expect((await handleRotate(request('/api/push/rotate', { oldEndpoint: ENDPOINT_A, subscription: subscriptionJson(ENDPOINT_B) }), deps)).status).toBe(404)
    expect((await handleRotate(request('/api/push/rotate', { oldEndpoint: 'x', subscription: subscriptionJson(ENDPOINT_B) }), deps)).status).toBe(400)
    expect(rows.size).toBe(0)
  })
})
