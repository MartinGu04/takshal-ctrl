import { DEFAULT_DESTINATIONS, systemsFromEnv } from './systems'

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
})
