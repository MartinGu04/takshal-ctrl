import { resolveDestination } from './destination'

const BASE = 'https://ctrl.example.org/'

describe('resolveDestination', () => {
  it('accepts absolute https URLs', () => {
    expect(resolveDestination('https://avaria.example.com/app', BASE)).toEqual({
      ok: true,
      href: 'https://avaria.example.com/app',
      origin: 'https://avaria.example.com',
      host: 'avaria.example.com',
    })
  })

  it('accepts http URLs and trims whitespace', () => {
    const result = resolveDestination('  http://localhost:5174  ', BASE)
    expect(result).toMatchObject({ ok: true, href: 'http://localhost:5174/', host: 'localhost:5174' })
  })

  it('resolves same-origin paths against the base', () => {
    expect(resolveDestination('/machlava/', BASE)).toMatchObject({
      ok: true,
      href: 'https://ctrl.example.org/machlava/',
    })
  })

  it('reports missing values', () => {
    expect(resolveDestination(undefined, BASE)).toEqual({ ok: false, reason: 'missing' })
    expect(resolveDestination('   ', BASE)).toEqual({ ok: false, reason: 'missing' })
  })

  it('rejects script and data URLs', () => {
    expect(resolveDestination('javascript:alert(1)', BASE)).toEqual({ ok: false, reason: 'unsafe-protocol' })
    expect(resolveDestination('data:text/html,hi', BASE)).toEqual({ ok: false, reason: 'unsafe-protocol' })
  })

  it('rejects malformed URLs', () => {
    expect(resolveDestination('https://', BASE)).toEqual({ ok: false, reason: 'invalid' })
  })
})
