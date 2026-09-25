// @vitest-environment node
import { supabaseAuthenticator } from './auth.js'
import { readHubEnv } from './env.js'
import { endpointFingerprint, isAllowedPushEndpoint } from './validation.js'

describe('hub environment', () => {
  const full = {
    SUPABASE_URL: 'https://p.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_server_test_key',
    VITE_VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
    VAPID_SUBJECT: 'mailto:ops@example.com',
  }

  it('reads a complete configuration', () => {
    expect(readHubEnv(full)).toEqual({
      ok: true,
      value: { supabaseUrl: full.SUPABASE_URL, supabaseSecretKey: 'sb_secret_server_test_key', vapidPublicKey: 'pub', vapidPrivateKey: 'priv', vapidSubject: full.VAPID_SUBJECT },
    })
  })

  it('reports what is missing, and validates the VAPID subject', () => {
    expect(readHubEnv({})).toMatchObject({ ok: false, missing: expect.arrayContaining(['SUPABASE_SECRET_KEY', 'VAPID_PRIVATE_KEY']) })
    expect(readHubEnv({ ...full, VAPID_SUBJECT: 'ops@example.com' })).toMatchObject({ ok: false })
  })

  it('requires a Supabase secret key (sb_secret_…)', () => {
    const publishable = readHubEnv({ ...full, SUPABASE_SECRET_KEY: 'sb_publishable_oops' })
    expect(publishable).toMatchObject({ ok: false, missing: [expect.stringContaining('a publishable key was given')] })

    const legacyServiceRole = readHubEnv({ ...full, SUPABASE_SECRET_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig' })
    expect(legacyServiceRole).toMatchObject({ ok: false, missing: [expect.stringContaining('legacy service_role keys are not supported')] })
  })

  it('no longer reads the legacy variable names', () => {
    const { SUPABASE_SECRET_KEY: _unused, ...rest } = full
    void _unused
    expect(readHubEnv({ ...rest, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' })).toMatchObject({ ok: false, missing: ['SUPABASE_SECRET_KEY'] })
  })
})

describe('push endpoint allowlist', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('allows %s', (endpoint) => expect(isAllowedPushEndpoint(endpoint)).toBe(true))

  it.each(['https://evil.example/', 'http://fcm.googleapis.com/x', 'https://notfcm.googleapis.com.evil/x', 'https://fcm.googleapis.com:8443/x', 'https://169.254.169.254/'])(
    'blocks %s',
    (endpoint) => expect(isAllowedPushEndpoint(endpoint)).toBe(false),
  )

  it('fingerprints endpoints without revealing them', () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/very-secret-token-123456'
    expect(endpointFingerprint(endpoint)).toBe('fcm.googleapis.com…123456')
  })
})

describe('Supabase authenticator', () => {
  it('trusts only users Supabase Auth verifies', async () => {
    const auth = supabaseAuthenticator({
      auth: {
        async getUser(jwt) {
          if (jwt === 'good') return { data: { user: { id: 'u1', aud: 'authenticated' } }, error: null }
          if (jwt === 'anon') return { data: { user: { id: 'u2', aud: 'anon' } }, error: null }
          return { data: { user: null }, error: new Error('invalid') }
        },
      },
    })
    expect(await auth.verify('good')).toEqual({ id: 'u1' })
    expect(await auth.verify('anon')).toBeNull()
    expect(await auth.verify('bad')).toBeNull()
  })
})
