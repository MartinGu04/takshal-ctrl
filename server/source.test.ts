// @vitest-environment node
import { handleMachlavaNotify, handleStatus, handleSubscribe, SOURCE_EVENT_LEASE_SECONDS, SOURCE_RATE_LIMIT } from './handlers.js'
import { hasValidSourceCredential, MIN_SOURCE_SECRET_LENGTH, parseSourceNotifyRequest } from './source.js'
import { MACHLAVA_SECRET, request, setupHub, subscriptionJson } from './testing/fixtures.js'

const PATH = '/api/source/machlava/notify'
const ENDPOINT_A = 'https://fcm.googleapis.com/fcm/send/alice-phone'
const ENDPOINT_B = 'https://web.push.apple.com/QGalice-ipad'
const NOW = Date.parse('2026-09-25T12:00:00Z')

const notify = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  eventId: 'job:3f7a0c52-1d7e-4c1b-9a53-0d6b2f1e8c11',
  recipientEmail: 'alice@example.com',
  title: 'שינוי במשמרת',
  body: 'המשמרת שלך ביום ראשון עודכנה.',
  target: '/schedule',
  ...overrides,
})

const send = (deps: ReturnType<typeof setupHub>['deps'], body: unknown, options: Parameters<typeof request>[2] = { token: MACHLAVA_SECRET }) =>
  handleMachlavaNotify(request(PATH, body, options), deps)

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

/** Alice signs in (verified email → mapping) and enables notifications on the given devices. */
async function enroll(hub: ReturnType<typeof setupHub>, ...endpoints: string[]) {
  for (const endpoint of endpoints) {
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(endpoint) }, { token: 'token-alice' }), hub.deps)
  }
}

describe('source ingress: authentication', () => {
  it('rejects a missing source secret', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    const response = await send(hub.deps, notify(), {})
    expect(response.status).toBe(401)
    expect(hub.sent).toHaveLength(0)
  })

  it.each([
    ['a wrong secret', `Bearer ${MACHLAVA_SECRET.slice(0, -1)}x`],
    ['a prefix of the secret', `Bearer ${MACHLAVA_SECRET.slice(0, 10)}`],
    ['the secret plus a suffix', `Bearer ${MACHLAVA_SECRET}0`],
    ['a user access token', 'Bearer token-alice'],
    ['the wrong scheme', `Basic ${MACHLAVA_SECRET}`],
    ['the bare secret', MACHLAVA_SECRET],
  ])('rejects %s', async (_name, authorization) => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    expect((await send(hub.deps, notify(), { authorization })).status).toBe(401)
    expect(hub.sent).toHaveLength(0)
    expect(hub.events.filter((event) => event.kind === 'source')).toHaveLength(0)
  })

  it('rejects everything when the hub has no secret for the source', async () => {
    const hub = setupHub({ sourceSecrets: {} })
    await enroll(hub, ENDPOINT_A)
    expect((await send(hub.deps, notify())).status).toBe(401)
    expect(hub.sent).toHaveLength(0)
  })

  it('never accepts a configured secret that is too short to be safe', () => {
    const short = 'x'.repeat(MIN_SOURCE_SECRET_LENGTH - 1)
    expect(hasValidSourceCredential(request(PATH, {}, { token: short }), short)).toBe(false)
    const long = 'x'.repeat(MIN_SOURCE_SECRET_LENGTH)
    expect(hasValidSourceCredential(request(PATH, {}, { token: long }), long)).toBe(true)
  })

  it('accepts the valid source secret', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    const response = await send(hub.deps, notify())
    expect(response.status).toBe(200)
    expect(await json(response)).toEqual({ accepted: true, delivered: 1, failed: 0, removed: 0 })
  })

  it('is POST + JSON only, with a size cap', async () => {
    const hub = setupHub()
    expect((await send(hub.deps, null, { token: MACHLAVA_SECRET, method: 'GET' })).status).toBe(405)
    expect((await send(hub.deps, 'a=1', { token: MACHLAVA_SECRET, contentType: 'application/x-www-form-urlencoded' })).status).toBe(415)
    expect((await send(hub.deps, 'a=1', { token: MACHLAVA_SECRET, contentType: 'text/plain' })).status).toBe(415)
    expect((await send(hub.deps, '{nope')).status).toBe(400)
    expect((await send(hub.deps, notify({ body: 'x'.repeat(9000) }))).status).toBe(413)
    expect((await send(hub.deps, [notify()])).status).toBe(400)
  })

  it('reports 503 when the hub itself is not configured', async () => {
    expect((await handleMachlavaNotify(request(PATH, notify(), { token: MACHLAVA_SECRET }), null)).status).toBe(503)
  })
})

describe('source ingress: request validation', () => {
  it.each([
    [notify({ version: 2 }), 'unsupported-version'],
    [notify({ version: undefined }), 'unsupported-version'],
    [notify({ eventId: undefined }), 'invalid-event-id'],
    [notify({ eventId: '' }), 'invalid-event-id'],
    [notify({ eventId: 'job 1' }), 'invalid-event-id'],
    [notify({ eventId: 'x'.repeat(129) }), 'invalid-event-id'],
    [notify({ eventId: 42 }), 'invalid-event-id'],
    [notify({ recipientEmail: undefined }), 'invalid-recipient'],
    [notify({ recipientEmail: 'not-an-email' }), 'invalid-recipient'],
    [notify({ recipientEmail: 'alice@example' }), 'invalid-recipient'],
    [notify({ recipientEmail: 'a b@example.com' }), 'invalid-recipient'],
    [notify({ recipientEmail: ['alice@example.com'] }), 'invalid-recipient'],
    [notify({ target: undefined }), 'missing-target'],
    [notify({ target: 'https://evil.example/' }), 'unsafe-target'],
    [notify({ target: 'http://luzly.vercel.app/schedule' }), 'unsafe-target'],
    [notify({ target: '//evil.example' }), 'unsafe-target'],
    [notify({ target: '/\\evil.example' }), 'unsafe-target'],
    [notify({ target: 'javascript:alert(1)' }), 'unsafe-target'],
    [notify({ target: 'schedule' }), 'unsafe-target'],
    [notify({ title: '' }), 'invalid-title'],
    [notify({ title: '   ' }), 'invalid-title'],
    [notify({ title: 'x'.repeat(121) }), 'invalid-title'],
    [notify({ body: 'x'.repeat(501) }), 'invalid-body'],
    [notify({ body: 7 }), 'invalid-body'],
    [notify({ tag: 'has space' }), 'invalid-tag'],
    [notify({ tag: 'x'.repeat(65) }), 'invalid-tag'],
    [notify({ timestamp: -1 }), 'invalid-timestamp'],
    [notify({ timestamp: 'now' }), 'invalid-timestamp'],
    // The payload can never choose its source, icon or destination URL.
    [notify({ source: 'avaria' }), 'unknown-field'],
    [notify({ icon: 'https://evil.example/x.png' }), 'unknown-field'],
    [notify({ url: 'https://evil.example' }), 'unknown-field'],
    [notify({ recipientUserId: 'user-bob' }), 'unknown-field'],
  ])('rejects malformed request %#: %s', async (body, error) => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    const response = await send(hub.deps, body)
    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error })
    expect(hub.sent).toHaveLength(0)
  })

  it('accepts title and body exactly at their limits', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    const response = await send(hub.deps, notify({ title: 't'.repeat(120), body: 'b'.repeat(500) }))
    expect(response.status).toBe(200)
    expect(hub.sent[0]!.payload).toMatchObject({ title: 't'.repeat(120), body: 'b'.repeat(500) })
  })

  it('normalizes the recipient email', () => {
    const parsed = parseSourceNotifyRequest('machlava', notify({ recipientEmail: '  Alice@Example.COM ' }))
    expect(parsed.ok && parsed.value.recipientEmail).toBe('alice@example.com')
  })
})

describe('source ingress: delivery', () => {
  it('sends one branded המחלבה push to the enrolled recipient, with only the relative target', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    await send(hub.deps, notify({ recipientEmail: ' ALICE@example.com', tag: 'machlava-shift' }))
    expect(hub.sent).toEqual([
      {
        endpoint: ENDPOINT_A,
        payload: { v: 1, source: 'machlava', title: 'שינוי במשמרת', body: 'המשמרת שלך ביום ראשון עודכנה.', target: '/schedule', tag: 'machlava-shift', timestamp: NOW },
      },
    ])
    expect(hub.events.filter((event) => event.kind === 'source')).toEqual([
      expect.objectContaining({ userId: 'user-alice', source: 'machlava', eventId: notify().eventId, status: 'completed', delivered: 1 }),
    ])
  })

  it('sends to every active device of the recipient, and only theirs', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A, ENDPOINT_B)
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson('https://fcm.googleapis.com/fcm/send/bob') }, { token: 'token-bob' }), hub.deps)
    const response = await send(hub.deps, notify())
    expect(await json(response)).toEqual({ accepted: true, delivered: 2, failed: 0, removed: 0 })
    expect(hub.sent.map((item) => item.endpoint).sort()).toEqual([ENDPOINT_A, ENDPOINT_B].sort())
  })

  it('answers an unknown address and a user without devices identically, without error', async () => {
    const unknown = setupHub()
    const unknownResponse = await send(unknown.deps, notify({ recipientEmail: 'nobody@example.com' }))

    const noDevices = setupHub()
    await handleStatus(request('/api/push/status', {}, { token: 'token-alice' }), noDevices.deps) // signed in, never enabled
    const noDevicesResponse = await send(noDevices.deps, notify())

    for (const response of [unknownResponse, noDevicesResponse]) {
      expect(response.status).toBe(200)
      expect(await json(response)).toEqual({ accepted: true, delivered: 0, reason: 'no_active_subscription' })
    }
    expect([...unknown.sent, ...noDevices.sent]).toHaveLength(0)
  })

  it('treats disabled subscriptions as inactive', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    for (const [id, row] of hub.rows) hub.rows.set(id, { ...row, enabled: false })
    expect(await json(await send(hub.deps, notify()))).toEqual({ accepted: true, delivered: 0, reason: 'no_active_subscription' })
    expect(hub.sent).toHaveLength(0)
  })

  it('still cleans up dead subscriptions by the hub’s existing rules', async () => {
    const hub = setupHub({ outcomeFor: (endpoint) => (endpoint === ENDPOINT_A ? { kind: 'gone', status: 410 } : { kind: 'delivered' }) })
    await enroll(hub, ENDPOINT_A, ENDPOINT_B)
    expect(await json(await send(hub.deps, notify()))).toEqual({ accepted: true, delivered: 1, failed: 0, removed: 1 })
    expect([...hub.rows.values()].map((row) => row.endpoint)).toEqual([ENDPOINT_B])
  })

  it('counts transient failures toward disabling a subscription, like any other push', async () => {
    const hub = setupHub({ outcomeFor: () => ({ kind: 'failed', status: 503 }) })
    await enroll(hub, ENDPOINT_A)
    expect(await json(await send(hub.deps, notify()))).toEqual({ accepted: true, delivered: 0, failed: 1, removed: 0 })
    expect([...hub.rows.values()][0]).toMatchObject({ failureCount: 1, enabled: true })
  })

  it('brands by route: the body cannot turn a המחלבה event into another source', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    expect((await send(hub.deps, notify({ source: 'system' }))).status).toBe(400)
    await send(hub.deps, notify())
    expect(hub.sent.map((item) => (item.payload as { source: string }).source)).toEqual(['machlava'])
  })
})

describe('source ingress: idempotency', () => {
  it('does not push again for a retried event id', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    expect(await json(await send(hub.deps, notify()))).toMatchObject({ accepted: true, delivered: 1 })
    expect(await json(await send(hub.deps, notify()))).toEqual({ accepted: true, duplicate: true, delivered: 0 })
    expect(await json(await send(hub.deps, notify({ title: 'changed on retry' })))).toEqual({ accepted: true, duplicate: true, delivered: 0 })
    expect(hub.sent).toHaveLength(1)
  })

  it('delivers distinct event ids separately', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    await send(hub.deps, notify({ eventId: 'job:1' }))
    await send(hub.deps, notify({ eventId: 'job:2' }))
    expect(hub.sent).toHaveLength(2)
  })

  it('is safe under concurrent duplicate requests', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A, ENDPOINT_B)
    const responses = await Promise.all(Array.from({ length: 6 }, () => send(hub.deps, notify())))
    const bodies = await Promise.all(responses.map(json))
    expect(bodies.filter((body) => body.duplicate === true)).toHaveLength(5)
    expect(bodies.filter((body) => body.delivered === 2)).toHaveLength(1)
    expect(hub.sent).toHaveLength(2) // one push per device, once
  })

  it('lets a retry take over an attempt that never finished, once its lease expired', async () => {
    let now = NOW
    const hub = setupHub({ now: () => now })
    await enroll(hub, ENDPOINT_A)
    // An earlier attempt claimed the event and crashed before delivering.
    await hub.deps.store.claimSourceEvent({ source: 'machlava', eventId: notify().eventId as string, userId: 'user-alice', leaseSeconds: SOURCE_EVENT_LEASE_SECONDS })

    expect(await json(await send(hub.deps, notify()))).toMatchObject({ duplicate: true })
    now += (SOURCE_EVENT_LEASE_SECONDS + 1) * 1000
    expect(await json(await send(hub.deps, notify()))).toMatchObject({ accepted: true, delivered: 1 })
    expect(await json(await send(hub.deps, notify()))).toMatchObject({ duplicate: true })
    expect(hub.sent).toHaveLength(1)
  })
})

describe('source ingress: abuse protection and logging', () => {
  it('rate limits per recipient without consuming the rejected event', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    for (let i = 0; i < SOURCE_RATE_LIMIT.max; i++) expect((await send(hub.deps, notify({ eventId: `job:${i}` }))).status).toBe(200)
    const limited = await send(hub.deps, notify({ eventId: 'job:over' }))
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe(String(SOURCE_RATE_LIMIT.windowSeconds))
    expect(hub.events.some((event) => event.eventId === 'job:over')).toBe(false)
  })

  it('never logs the secret, the recipient, endpoints or notification content', async () => {
    const hub = setupHub({ outcomeFor: (endpoint) => (endpoint === ENDPOINT_A ? { kind: 'gone', status: 410 } : { kind: 'failed', status: 500 }) })
    await enroll(hub, ENDPOINT_A, ENDPOINT_B)
    await send(hub.deps, notify())
    await send(hub.deps, notify())
    await send(hub.deps, notify({ eventId: 'job:unknown', recipientEmail: 'stranger@example.com' }))
    await send(hub.deps, notify({ title: '' }))
    await send(hub.deps, notify(), { authorization: 'Bearer wrong-secret-value' })

    const logs = hub.logs.join('\n')
    expect(logs).toContain('source: machlava')
    for (const secret of [MACHLAVA_SECRET, 'wrong-secret-value', 'alice@example.com', 'stranger@example.com', ENDPOINT_A, ENDPOINT_B, notify().title as string, notify().body as string, notify().eventId as string]) {
      expect(logs).not.toContain(secret)
    }
  })

  it('never echoes the recipient or devices back to the source', async () => {
    const hub = setupHub()
    await enroll(hub, ENDPOINT_A)
    const text = await (await send(hub.deps, notify())).text()
    for (const secret of ['alice', 'user-alice', ENDPOINT_A]) expect(text).not.toContain(secret)
  })
})

describe('recipient mapping (verified email → user)', () => {
  it('is created from the verified session on status and subscribe', async () => {
    const hub = setupHub()
    await handleStatus(request('/api/push/status', {}, { token: 'token-alice' }), hub.deps)
    expect([...hub.recipients]).toEqual([['user-alice', 'alice@example.com']])

    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson() }, { token: 'token-bob' }), hub.deps)
    expect(hub.recipients.get('user-bob')).toBe('bob@example.com')
  })

  it('is never created without a verified email, whatever the body claims', async () => {
    const hub = setupHub()
    await handleStatus(request('/api/push/status', { email: 'alice@example.com', verifiedEmail: 'alice@example.com' }, { token: 'token-carol' }), hub.deps)
    await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson(), email: 'alice@example.com' }, { token: 'token-carol' }), hub.deps)
    expect(hub.recipients.size).toBe(0)
    expect(await json(await send(hub.deps, notify()))).toMatchObject({ delivered: 0, reason: 'no_active_subscription' })
  })

  it('moves an address to the latest verified owner', async () => {
    const hub = setupHub()
    await hub.deps.store.rememberRecipient('user-old', 'alice@example.com')
    await handleStatus(request('/api/push/status', {}, { token: 'token-alice' }), hub.deps)
    expect(await hub.deps.store.findRecipientUserId('alice@example.com')).toBe('user-alice')
    expect(hub.recipients.has('user-old')).toBe(false)
  })

  it('never breaks status or subscribe when the mapping cannot be written', async () => {
    const hub = setupHub()
    hub.deps.store.rememberRecipient = async () => {
      throw new Error('database-error')
    }
    const subscribed = await handleSubscribe(request('/api/push/subscribe', { subscription: subscriptionJson() }, { token: 'token-alice' }), hub.deps)
    expect(subscribed.status).toBe(201)
    const status = await handleStatus(request('/api/push/status', { endpoint: subscriptionJson().endpoint }, { token: 'token-alice' }), hub.deps)
    expect(await json(status)).toEqual({ registered: true, devices: 1 })
    expect(hub.logs).toContain('hub: recipient mapping refresh failed')
  })
})
