/** Public (build-time) configuration for notification enrollment. No secrets live here. */

export interface NotificationConfig {
  readonly supabaseUrl: string
  readonly supabaseAnonKey: string
  readonly vapidPublicKey: string
}

export function readNotificationConfig(env: Partial<Record<keyof ImportMetaEnv, string | undefined>> = import.meta.env): NotificationConfig | null {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim()
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  const vapidPublicKey = env.VITE_VAPID_PUBLIC_KEY?.trim()
  if (!supabaseUrl || !supabaseAnonKey || !vapidPublicKey) return null
  return { supabaseUrl, supabaseAnonKey, vapidPublicKey }
}
