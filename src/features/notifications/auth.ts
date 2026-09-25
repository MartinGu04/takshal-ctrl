/**
 * Google sign-in for notification enrollment, via Supabase Auth.
 *
 * Loaded lazily: anonymous visitors of the portal never download the auth client. It is only
 * fetched when someone opens the notification panel or returns from the Google sign-in.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotificationConfig } from './config'

export interface Session {
  readonly accessToken: string
  readonly email: string | null
}

export interface AuthPort {
  getSession(): Promise<Session | null>
  signIn(): Promise<void>
  signOut(): Promise<void>
  onChange(listener: () => void): () => void
}

/** Query flag appended to the OAuth return URL so the panel reopens after sign-in. */
export const AUTH_RETURN_FLAG = 'notifications'

let client: Promise<SupabaseClient> | null = null

function supabase(config: NotificationConfig): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'takshal-ctrl-auth' },
    }),
  )
  return client
}

export function supabaseAuth(config: NotificationConfig): AuthPort {
  return {
    async getSession() {
      const { data } = await (await supabase(config)).auth.getSession()
      const session = data.session
      return session ? { accessToken: session.access_token, email: session.user.email ?? null } : null
    },
    async signIn() {
      const redirectTo = new URL(`/?${AUTH_RETURN_FLAG}=1`, window.location.origin).href
      const { error } = await (await supabase(config)).auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, queryParams: { prompt: 'select_account' } },
      })
      if (error) throw error
    },
    async signOut() {
      await (await supabase(config)).auth.signOut({ scope: 'local' })
    },
    onChange(listener) {
      let unsubscribe = () => {}
      void supabase(config).then((sb) => {
        const { data } = sb.auth.onAuthStateChange(() => listener())
        unsubscribe = () => data.subscription.unsubscribe()
      })
      return () => unsubscribe()
    },
  }
}

/** True when this page load is the return leg of the Google sign-in. */
export function isAuthReturn(location: Location = window.location): boolean {
  const params = new URLSearchParams(location.search)
  return params.has(AUTH_RETURN_FLAG) || params.has('code')
}

/** Removes sign-in parameters from the address bar once handled. */
export function clearAuthReturn(): void {
  const url = new URL(window.location.href)
  for (const key of [AUTH_RETURN_FLAG, 'code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}
