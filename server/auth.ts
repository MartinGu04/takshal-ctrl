/** Resolves the authenticated TAKSHAL CTRL user behind a request. */

import { bearerToken } from './http.js'
import { parseEmail } from './identity.js'

export interface AuthenticatedUser {
  readonly id: string
  /**
   * The account's normalized email, present only when Supabase Auth reports it as verified
   * (`email_confirmed_at`, set by the Google provider for Google-verified addresses). Comes from
   * the verified session, never from anything the browser sent.
   */
  readonly verifiedEmail?: string
}

export interface Authenticator {
  /** Returns the user for a valid access token, or null. Never trusts client-supplied identity. */
  verify(accessToken: string): Promise<AuthenticatedUser | null>
}

export async function authenticate(request: Request, authenticator: Authenticator): Promise<AuthenticatedUser | null> {
  const token = bearerToken(request)
  if (!token) return null
  try {
    return await authenticator.verify(token)
  } catch {
    return null
  }
}

/** Minimal surface of the Supabase auth client used here (keeps tests free of the SDK). */
export interface SupabaseAuthLike {
  auth: {
    getUser(jwt: string): Promise<{
      data: { user: { id: string; aud?: string; email?: string | null; email_confirmed_at?: string | null } | null }
      error: unknown
    }>
  }
}

export function supabaseAuthenticator(client: SupabaseAuthLike): Authenticator {
  return {
    async verify(accessToken) {
      // Validated by Supabase Auth itself (signature, expiry, revocation).
      const { data, error } = await client.auth.getUser(accessToken)
      if (error || !data.user) return null
      if (data.user.aud && data.user.aud !== 'authenticated') return null
      const verifiedEmail = data.user.email_confirmed_at ? parseEmail(data.user.email) : null
      return verifiedEmail ? { id: data.user.id, verifiedEmail } : { id: data.user.id }
    },
  }
}
