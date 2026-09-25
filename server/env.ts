/** Server-only configuration. Never import this from browser code. */

export interface HubEnv {
  readonly supabaseUrl: string
  readonly supabaseServiceRoleKey: string
  readonly vapidPublicKey: string
  readonly vapidPrivateKey: string
  readonly vapidSubject: string
}

export type EnvSource = Record<string, string | undefined>

/** Returns the hub configuration, or null (with the missing names) when incomplete. */
export function readHubEnv(env: EnvSource): { ok: true; value: HubEnv } | { ok: false; missing: string[] } {
  const pick = (...names: string[]) => names.map((name) => env[name]?.trim()).find(Boolean) ?? ''
  const value: HubEnv = {
    supabaseUrl: pick('SUPABASE_URL', 'VITE_SUPABASE_URL'),
    supabaseServiceRoleKey: pick('SUPABASE_SERVICE_ROLE_KEY'),
    vapidPublicKey: pick('VAPID_PUBLIC_KEY', 'VITE_VAPID_PUBLIC_KEY'),
    vapidPrivateKey: pick('VAPID_PRIVATE_KEY'),
    vapidSubject: pick('VAPID_SUBJECT'),
  }
  const missing = [
    ['SUPABASE_URL', value.supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', value.supabaseServiceRoleKey],
    ['VITE_VAPID_PUBLIC_KEY', value.vapidPublicKey],
    ['VAPID_PRIVATE_KEY', value.vapidPrivateKey],
    ['VAPID_SUBJECT', value.vapidSubject],
  ]
    .filter(([, v]) => !v)
    .map(([name]) => name as string)
  if (value.vapidSubject && !/^(mailto:|https:\/\/)/.test(value.vapidSubject)) missing.push('VAPID_SUBJECT (must start with mailto: or https://)')
  return missing.length ? { ok: false, missing } : { ok: true, value }
}
