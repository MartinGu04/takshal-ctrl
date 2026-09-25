import { handoffPathFor, isSameOriginPath, resolveHandoff } from './handoff.js'
import { createNotificationPayload, parseNotificationPayload, PAYLOAD_VERSION } from './payload.js'
import { isNotificationSource, SOURCE_BRANDING } from './sources.js'
import { buildDestinationUrl, isSafeRelativeTarget } from './targets.js'

const DESTINATIONS = { avaria: 'https://takalot.vercel.app/', machlava: 'https://luzly.vercel.app/' }

describe('notification sources', () => {
  it('accepts only the known sources', () => {
    expect(['avaria', 'machlava', 'system'].every(isNotificationSource)).toBe(true)
    for (const bad of ['Avaria', 'admin', '', null, 1, {}, 'avaria ']) expect(isNotificationSource(bad)).toBe(false)
  })

  it('maps every source to a same-origin icon', () => {
    for (const brand of Object.values(SOURCE_BRANDING)) expect(brand.icon).toMatch(/^\/icons\/[a-z0-9-]+\.png$/)
  })
})

describe('target validation', () => {
  it.each(['/', '/incident/123', '/incidents?status=open&page=2', '/a/b#section', '/%D7%A9'])('accepts safe relative path %s', (target) => {
    expect(isSafeRelativeTarget(target)).toBe(true)
  })

  it.each([
    'https://evil.example/',
    'http://takalot.vercel.app/',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'data:text/html,<script>',
    'incident/123',
    ' /incident',
    '/\t/evil.example',
    '/\n/evil.example',
    '/incident /123',
    '',
    `/${'a'.repeat(600)}`,
  ])('rejects %j', (target) => {
    expect(isSafeRelativeTarget(target)).toBe(false)
  })

  it('rejects non-strings', () => {
    for (const bad of [null, undefined, 1, {}, ['/x']]) expect(isSafeRelativeTarget(bad)).toBe(false)
  })

  it('builds destinations only from the trusted base', () => {
    expect(buildDestinationUrl(DESTINATIONS.avaria, '/incident/123')).toBe('https://takalot.vercel.app/incident/123')
    expect(buildDestinationUrl(DESTINATIONS.avaria)).toBe('https://takalot.vercel.app/')
    expect(buildDestinationUrl(DESTINATIONS.avaria, '//evil.example/x')).toBeNull()
    expect(buildDestinationUrl(DESTINATIONS.avaria, 'https://evil.example/')).toBeNull()
    expect(buildDestinationUrl('javascript:alert(1)', '/x')).toBeNull()
  })
})

describe('payload parsing', () => {
  const valid = { v: PAYLOAD_VERSION, source: 'avaria', title: 'תקלה חדשה', body: 'מדפסת בקומה 2', target: '/incident/123', tag: 'incident-123', timestamp: 1_700_000_000_000 }

  it('accepts a valid v1 payload', () => {
    expect(parseNotificationPayload(valid)).toEqual({ ok: true, value: valid })
  })

  it('drops unknown fields, including any icon or URL', () => {
    const result = parseNotificationPayload({ ...valid, icon: 'https://evil.example/x.png', url: 'https://evil.example', html: '<b>' })
    expect(result.ok && Object.keys(result.value).sort()).toEqual(['body', 'source', 'tag', 'target', 'timestamp', 'title', 'v'])
  })

  it.each([
    [{ ...valid, v: 2 }, 'unsupported-version'],
    [{ ...valid, source: 'evil' }, 'unknown-source'],
    [{ ...valid, title: '' }, 'invalid-title'],
    [{ ...valid, title: 'x'.repeat(121) }, 'invalid-title'],
    [{ ...valid, body: 42 }, 'invalid-body'],
    [{ ...valid, target: 'https://evil.example' }, 'unsafe-target'],
    [{ ...valid, target: '//evil.example' }, 'unsafe-target'],
    [{ ...valid, source: 'system', target: '/x' }, 'system-target-not-allowed'],
    [{ ...valid, tag: 'has space' }, 'invalid-tag'],
    [{ ...valid, timestamp: -1 }, 'invalid-timestamp'],
    [null, 'not-an-object'],
    [[valid], 'not-an-object'],
    ['{"v":1}', 'not-an-object'],
  ])('rejects %j', (input, error) => {
    expect(parseNotificationPayload(input)).toEqual({ ok: false, error })
  })

  it('keeps markup-like text as inert text', () => {
    const result = parseNotificationPayload({ ...valid, title: '<img src=x onerror=alert(1)>' })
    expect(result.ok && result.value.title).toBe('<img src=x onerror=alert(1)>')
  })

  it('createNotificationPayload throws on invalid input', () => {
    expect(() => createNotificationPayload({ source: 'avaria', title: 't', body: 'b', target: 'https://evil.example' })).toThrow()
  })
})

describe('click hand-off', () => {
  it('routes source notifications through /open and system ones to the portal', () => {
    expect(handoffPathFor({ source: 'avaria', target: '/incident/123' })).toBe('/open?app=avaria&target=%2Fincident%2F123')
    expect(handoffPathFor({ source: 'machlava' })).toBe('/open?app=machlava')
    expect(handoffPathFor({ source: 'system' })).toBe('/')
    expect(handoffPathFor({ source: 'avaria', target: '//evil.example' })).toBe('/open?app=avaria')
  })

  it('resolves valid hand-offs against the configured base only', () => {
    expect(resolveHandoff('?app=avaria&target=%2Fincident%2F123', DESTINATIONS)).toEqual({
      kind: 'external',
      app: 'avaria',
      url: 'https://takalot.vercel.app/incident/123',
    })
    expect(resolveHandoff('?app=machlava', DESTINATIONS)).toEqual({ kind: 'external', app: 'machlava', url: 'https://luzly.vercel.app/' })
    expect(resolveHandoff('', DESTINATIONS)).toEqual({ kind: 'portal' })
    expect(resolveHandoff('?app=ctrl', DESTINATIONS)).toEqual({ kind: 'portal' })
  })

  it.each([
    ['?app=evil', 'unknown-app'],
    ['?app=avaria&target=https%3A%2F%2Fevil.example', 'unsafe-target'],
    ['?app=avaria&target=%2F%2Fevil.example', 'unsafe-target'],
    ['?app=avaria&target=%2F%5Cevil.example', 'unsafe-target'],
    ['?app=avaria&target=javascript%3Aalert(1)', 'unsafe-target'],
    ['?app=avaria&url=https%3A%2F%2Fevil.example&target=%09%2F%2Fevil', 'unsafe-target'],
  ])('rejects malicious hand-off %s', (search, reason) => {
    expect(resolveHandoff(search, DESTINATIONS)).toEqual({ kind: 'invalid', reason })
  })

  it('refuses when the destination is not configured', () => {
    expect(resolveHandoff('?app=avaria', { avaria: null, machlava: DESTINATIONS.machlava })).toEqual({ kind: 'invalid', reason: 'no-destination' })
  })

  it('only treats same-origin paths as openable', () => {
    expect(isSameOriginPath('/open?app=avaria')).toBe(true)
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil', 'open', null]) expect(isSameOriginPath(bad)).toBe(false)
  })
})
