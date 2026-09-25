/** Server-only configuration. Never import this from browser code. */

import { isPublishableKey, isSecretKey } from '../src/shared/supabaseKeys.js'

export interface HubEnv {
  readonly supabaseUrl: string
  /** Supabase secret key (`sb_secret_…`); acts as the Postgres service_role. */
  readonly supabaseSecretKey: string
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
    supabaseSecretKey: pick('SUPABASE_SECRET_KEY'),
    vapidPublicKey: pick('VAPID_PUBLIC_KEY', 'VITE_VAPID_PUBLIC_KEY'),
    vapidPrivateKey: pick('VAPID_PRIVATE_KEY'),
    vapidSubject: pick('VAPID_SUBJECT'),
  }
  const missing = [
    ['SUPABASE_URL', value.supabaseUrl],
    ['SUPABASE_SECRET_KEY', value.supabaseSecretKey],
    ['VITE_VAPID_PUBLIC_KEY', value.vapidPublicKey],
    ['VAPID_PRIVATE_KEY', value.vapidPrivateKey],
    ['VAPID_SUBJECT', value.vapidSubject],
  ]
    .filter(([, v]) => !v)
    .map(([name]) => name as string)
  if (value.vapidSubject && !/^(mailto:|https:\/\/)/.test(value.vapidSubject)) missing.push('VAPID_SUBJECT (must start with mailto: or https://)')
  if (value.supabaseSecretKey && !isSecretKey(value.supabaseSecretKey)) {
    missing.push(
      isPublishableKey(value.supabaseSecretKey)
        ? 'SUPABASE_SECRET_KEY (a publishable key was given; use a secret key: sb_secret_…)'
        : 'SUPABASE_SECRET_KEY (must be a Supabase secret key: sb_secret_…; legacy service_role keys are not supported)',
    )
  }
  return missing.length ? { ok: false, missing } : { ok: true, value }
}
