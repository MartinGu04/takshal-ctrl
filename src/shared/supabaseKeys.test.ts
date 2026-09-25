import { findClientExposedSecrets, isLegacyJwtKey, isPrivilegedKey, isPublishableKey, isSecretKey } from './supabaseKeys.js'

// Unsigned JWT-shaped strings carrying a `role` claim, like the legacy anon / service_role keys.
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`

describe('Supabase key model', () => {
  it('recognises publishable and secret keys by their prefixes', () => {
    expect(isPublishableKey('sb_publishable_AbC-123_x')).toBe(true)
    expect(isSecretKey('sb_secret_AbC-123_x')).toBe(true)
    expect(isPublishableKey('sb_secret_AbC')).toBe(false)
    expect(isSecretKey('sb_publishable_AbC')).toBe(false)
  })

  it.each(['', 'sb_publishable_', 'sb_publishable_has space', 'publishable_x', jwt('anon'), null, 42])('rejects %j as a publishable key', (value) => {
    expect(isPublishableKey(value)).toBe(false)
  })

  it('identifies legacy JWT keys and which of them are privileged', () => {
    expect(isLegacyJwtKey(jwt('anon'))).toBe(true)
    expect(isPrivilegedKey(jwt('anon'))).toBe(false)
    expect(isPrivilegedKey(jwt('service_role'))).toBe(true)
    expect(isPrivilegedKey('sb_secret_abc')).toBe(true)
    expect(isPrivilegedKey('sb_publishable_abc')).toBe(false)
  })

  it('flags only browser-exposed (VITE_) variables holding privileged keys', () => {
    expect(
      findClientExposedSecrets({
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ok',
        VITE_SUPABASE_URL: 'https://p.supabase.co',
        VITE_OOPS: ' sb_secret_leak ',
        VITE_LEGACY: jwt('service_role'),
        SUPABASE_SECRET_KEY: 'sb_secret_fine_on_server',
      }).sort(),
    ).toEqual(['VITE_LEGACY', 'VITE_OOPS'])
  })
})
