import { evaluateSupport, readSupportEnv, type SupportEnv } from './support'

const base: SupportEnv = {
  isSecureContext: true,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isStandalone: false,
  hasStandaloneFlag: false,
}

describe('Web Push support detection', () => {
  it('supports modern desktop/Android browsers', () => {
    expect(evaluateSupport(base)).toBe('supported')
  })

  it('asks iPhone/iPad Safari tabs to install first (PushManager only exists in Home Screen apps)', () => {
    expect(evaluateSupport({ ...base, hasPushManager: false, hasNotification: false, hasStandaloneFlag: true })).toBe('install-required')
  })

  it('supports iOS Home Screen web apps', () => {
    expect(evaluateSupport({ ...base, hasStandaloneFlag: true, isStandalone: true })).toBe('supported')
  })

  it('is unsupported on insecure origins, without service workers, or without push APIs', () => {
    expect(evaluateSupport({ ...base, isSecureContext: false })).toBe('unsupported')
    expect(evaluateSupport({ ...base, hasServiceWorker: false })).toBe('unsupported')
    expect(evaluateSupport({ ...base, hasPushManager: false })).toBe('unsupported')
    // An installed iOS app that still lacks push (older iOS) is unsupported, not "install first".
    expect(evaluateSupport({ ...base, hasPushManager: false, hasStandaloneFlag: true, isStandalone: true })).toBe('unsupported')
  })

  it('reads capabilities by feature detection, not the user agent', () => {
    const fakeWindow = {
      isSecureContext: true,
      navigator: { serviceWorker: {}, standalone: false, userAgent: 'iPhone lies here' },
      matchMedia: () => ({ matches: false }),
    } as unknown as Window & typeof globalThis
    expect(readSupportEnv(fakeWindow)).toEqual({
      isSecureContext: true,
      hasServiceWorker: true,
      hasPushManager: false,
      hasNotification: false,
      isStandalone: false,
      hasStandaloneFlag: true,
    })
  })
})
