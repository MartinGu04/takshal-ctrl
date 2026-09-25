import { readNotificationConfig } from './config'

const env = {
  VITE_SUPABASE_URL: 'https://p.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_key',
  VITE_VAPID_PUBLIC_KEY: 'BPublicKey',
}

describe('notification config', () => {
  it('reads the publishable key model', () => {
    expect(readNotificationConfig(env)).toEqual({
      supabaseUrl: 'https://p.supabase.co',
      supabasePublishableKey: 'sb_publishable_browser_key',
      vapidPublicKey: 'BPublicKey',
    })
  })

  it('is unconfigured when any value is missing', () => {
    for (const key of Object.keys(env)) expect(readNotificationConfig({ ...env, [key]: '' })).toBeNull()
  })

  it.each(['sb_secret_should_never_be_here', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig', 'random'])('rejects %s as the browser key', (key) => {
    expect(readNotificationConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toBeNull()
  })

  it('ignores the legacy VITE_SUPABASE_ANON_KEY name', () => {
    const { VITE_SUPABASE_PUBLISHABLE_KEY: _unused, ...rest } = env
    void _unused
    expect(readNotificationConfig({ ...rest, VITE_SUPABASE_ANON_KEY: 'sb_publishable_x' } as never)).toBeNull()
  })
})
