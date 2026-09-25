/** Public (build-time) configuration for notification enrollment. No secrets live here. */

import { isPublishableKey } from '../../shared/supabaseKeys'

export interface NotificationConfig {
  readonly supabaseUrl: string
  /** Supabase publishable key (`sb_publishable_…`). Browser-safe by design. */
  readonly supabasePublishableKey: string
  readonly vapidPublicKey: string
}

export function readNotificationConfig(env: Partial<Record<keyof ImportMetaEnv, string | undefined>> = import.meta.env): NotificationConfig | null {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim()
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  const vapidPublicKey = env.VITE_VAPID_PUBLIC_KEY?.trim()
  if (!supabaseUrl || !supabasePublishableKey || !vapidPublicKey) return null
  // Only the publishable key model is supported; anything else (a legacy anon JWT, or a
  // secret key by mistake) leaves notifications unconfigured rather than half-working.
  if (!isPublishableKey(supabasePublishableKey)) return null
  return { supabaseUrl, supabasePublishableKey, vapidPublicKey }
}
