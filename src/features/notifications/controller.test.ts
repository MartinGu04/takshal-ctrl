import { createFakes, ENDPOINT, fakeController, fakeSubscription } from './testing'

describe('notification controller: states', () => {
  it('is not configured without public config', async () => {
    expect((await fakeController(createFakes(), null).refresh()).status).toBe('not-configured')
  })

  it('reports unsupported and install-required before anything else', async () => {
    expect((await fakeController(createFakes({ support: 'unsupported' })).refresh()).status).toBe('unsupported')
    expect((await fakeController(createFakes({ support: 'install-required', session: null })).refresh()).status).toBe('install-required')
  })

  it('asks to sign in when there is no session', async () => {
    expect((await fakeController(createFakes({ session: null })).refresh()).status).toBe('signed-out')
  })

  it('is ready when signed in without a subscription, and never requests permission on its own', async () => {
    const fakes = createFakes()
    const state = await fakeController(fakes).refresh()
    expect(state).toMatchObject({ status: 'ready', email: 'user@example.com' })
    expect(fakes.calls).not.toContain('requestPermission')
  })

  it('shows denied when permission is blocked', async () => {
    expect((await fakeController(createFakes({ permission: 'denied' })).refresh()).status).toBe('denied')
  })

  it('is enabled when the device is subscribed and registered', async () => {
    const fakes = createFakes({ permission: 'granted', subscription: fakeSubscription(), registered: true })
    expect(await fakeController(fakes).refresh()).toMatchObject({ status: 'enabled', devices: 1 })
  })

  it('re-registers a local subscription the hub has lost (resubscribe)', async () => {
    const fakes = createFakes({ permission: 'granted', subscription: fakeSubscription(), registered: false })
    expect((await fakeController(fakes).refresh()).status).toBe('enabled')
    expect(fakes.calls).toContain(`api.subscribe:token:${ENDPOINT}`)
  })
})

describe('notification controller: actions', () => {
  it('enable(): requests permission first, subscribes, persists against the session', async () => {
    const fakes = createFakes()
    const controller = fakeController(fakes)
    await controller.refresh()
    const state = await controller.enable()
    expect(state.status).toBe('enabled')
    expect(fakes.calls.slice(0, 3)).toEqual(['requestPermission', 'subscribe:BKey', `api.subscribe:token:${ENDPOINT}`])
  })

  it('enable(): requests permission synchronously (inside the user gesture)', () => {
    const fakes = createFakes()
    void fakeController(fakes).enable()
    expect(fakes.calls[0]).toBe('requestPermission') // recorded before the first await resolves
  })

  it('enable(): handles permission denied without subscribing', async () => {
    const fakes = createFakes({ permissionAnswer: 'denied' })
    expect((await fakeController(fakes).enable()).status).toBe('denied')
    expect(fakes.calls.some((call) => call.startsWith('subscribe'))).toBe(false)
  })

  it('enable(): a dismissed prompt returns to ready', async () => {
    expect((await fakeController(createFakes({ permissionAnswer: 'default' })).enable()).status).toBe('ready')
  })

  it('enable(): surfaces hub errors and expired sessions', async () => {
    expect((await fakeController(createFakes({ subscribeResult: { ok: false, status: 500, error: 'internal' } })).enable()).status).toBe('error')
    expect((await fakeController(createFakes({ subscribeResult: { ok: false, status: 401, error: 'unauthorized' } })).enable()).status).toBe('signed-out')
  })

  it('disable(): unregisters this device from the hub, then the browser', async () => {
    const fakes = createFakes({ permission: 'granted', subscription: fakeSubscription(), registered: true })
    const controller = fakeController(fakes)
    await controller.refresh()
    const state = await controller.disable()
    expect(fakes.calls).toContain(`api.unsubscribe:token:${ENDPOINT}`)
    expect(fakes.subscription?.unsubscribed).toBe(true)
    expect(state).toMatchObject({ status: 'ready', feedback: 'disabled' })
  })

  it('sendTest(): targets the current device; the server derives the user', async () => {
    const fakes = createFakes({ permission: 'granted', subscription: fakeSubscription(), registered: true })
    const state = await fakeController(fakes).sendTest()
    expect(fakes.calls).toContain(`api.test:token:${ENDPOINT}`)
    expect(state.feedback).toBe('test-sent')
  })

  it('sendTest(): reports rate limiting', async () => {
    const fakes = createFakes({ permission: 'granted', subscription: fakeSubscription(), testResult: { ok: false, status: 429, error: 'rate-limited', retryAfter: 600 } })
    expect((await fakeController(fakes).sendTest()).feedback).toBe('test-rate-limited')
  })

  it('signOut(): removes this device before signing out', async () => {
    const fakes = createFakes({ permission: 'granted', subscription: fakeSubscription(), registered: true })
    const state = await fakeController(fakes).signOut()
    expect(fakes.calls).toEqual([`api.unsubscribe:token:${ENDPOINT}`, 'signOut'])
    expect(state.status).toBe('signed-out')
  })
})
