import { buildNotification, FALLBACK_NOTIFICATION, pickClientToFocus, resolveClickUrl } from './logic'

const ORIGIN = 'https://ctrl.example'

describe('service worker: push → notification', () => {
  it('brands an Avaria notification with its local icon and a same-origin hand-off', () => {
    const { title, options } = buildNotification(
      JSON.stringify({ v: 1, source: 'avaria', title: 'תקלה חדשה', body: 'מדפסת בקומה 2', target: '/incident/7', tag: 'incident-7', timestamp: 5 }),
    )
    expect(title).toBe('Avaria · תקלה חדשה')
    expect(options).toMatchObject({
      body: 'מדפסת בקומה 2',
      icon: '/icons/notify-avaria-192.png',
      tag: 'incident-7',
      renotify: true,
      timestamp: 5,
      dir: 'rtl',
      data: { url: '/open?app=avaria&target=%2Fincident%2F7', source: 'avaria' },
    })
  })

  it('brands המחלבה notifications', () => {
    const { title, options } = buildNotification(JSON.stringify({ v: 1, source: 'machlava', title: 'משמרת', body: 'שובצת' }))
    expect(title).toBe('המחלבה · משמרת')
    expect(options.icon).toBe('/icons/notify-machlava-192.png')
  })

  it('uses TAKSHAL CTRL identity for system notifications, opening the portal', () => {
    const { title, options } = buildNotification(JSON.stringify({ v: 1, source: 'system', title: 'TAKSHAL CTRL', body: 'ההתראות מחוברות ועובדות.' }))
    expect(title).toBe('TAKSHAL CTRL')
    expect(options.icon).toBe('/icons/icon-192.png')
    expect(options.data.url).toBe('/')
  })

  it('never takes an icon or URL from the payload', () => {
    const { options } = buildNotification(
      JSON.stringify({ v: 1, source: 'avaria', title: 't', body: 'b', icon: 'https://evil.example/i.png', url: 'https://evil.example' }),
    )
    expect(options.icon).toBe('/icons/notify-avaria-192.png')
    expect(options.data.url).toBe('/open?app=avaria')
  })

  it.each([null, '', 'not json', '{"v":9}', JSON.stringify({ v: 1, source: 'avaria', title: 't', body: 'b', target: 'https://evil.example' })])(
    'shows a generic notification for invalid data %j',
    (text) => {
      const built = buildNotification(text, 42)
      expect(built.title).toBe(FALLBACK_NOTIFICATION.title)
      expect(built.options.data.url).toBe('/')
      expect(built.options.timestamp).toBe(42)
    },
  )
})

describe('service worker: notification click', () => {
  it('opens same-origin hand-off paths', () => {
    expect(resolveClickUrl({ url: '/open?app=avaria&target=%2Fx' }, ORIGIN)).toBe(`${ORIGIN}/open?app=avaria&target=%2Fx`)
  })

  it.each([{ url: 'https://evil.example' }, { url: '//evil.example' }, { url: '/\\evil' }, null, 'x', { url: 5 }])('falls back to the portal for %j', (data) => {
    expect(resolveClickUrl(data, ORIGIN)).toBe(`${ORIGIN}/`)
  })

  it('reuses an existing TAKSHAL CTRL window only', () => {
    const windows = [{ url: 'https://takalot.vercel.app/' }, { url: `${ORIGIN}/` }]
    expect(pickClientToFocus(windows, ORIGIN)).toBe(windows[1])
    expect(pickClientToFocus([{ url: 'https://evil.example' }], ORIGIN)).toBeUndefined()
  })
})
