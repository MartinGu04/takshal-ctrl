import { createSystems, DEFAULT_DESTINATIONS, systemsFromEnv } from './systems'

describe('systems configuration', () => {
  it('points at the production systems by default', () => {
    expect(DEFAULT_DESTINATIONS).toEqual({
      avaria: 'https://takalot.vercel.app/',
      machlava: 'https://luzly.vercel.app/',
    })

    const [avaria, machlava] = systemsFromEnv()
    expect(avaria.destination).toMatchObject({ ok: true, href: 'https://takalot.vercel.app/' })
    expect(machlava.destination).toMatchObject({ ok: true, href: 'https://luzly.vercel.app/' })
  })

  it('uses build-time overrides for each system independently', () => {
    vi.stubEnv('VITE_AVARIA_URL', 'https://avaria.staging.test/')
    vi.stubEnv('VITE_MACHLAVA_URL', '/machlava/')
    try {
      const [avaria, machlava] = systemsFromEnv()
      expect(avaria.destination).toMatchObject({ ok: true, href: 'https://avaria.staging.test/' })
      expect(machlava.destination).toMatchObject({ ok: true, href: new URL('/machlava/', window.location.href).href })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('marks a missing or unsafe destination unavailable without affecting the other system', () => {
    const [avaria, machlava] = createSystems({ avariaUrl: 'javascript:alert(1)', machlavaUrl: undefined }, 'https://portal.test/')
    expect(avaria.destination.ok).toBe(false)
    expect(machlava.destination.ok).toBe(false)

    const [, onlyMachlava] = createSystems({ avariaUrl: undefined, machlavaUrl: 'https://machlava.test/' }, 'https://portal.test/')
    expect(onlyMachlava.destination).toMatchObject({ ok: true, href: 'https://machlava.test/' })
  })
})
