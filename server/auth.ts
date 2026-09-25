/** Resolves the authenticated TAKSHAL CTRL user behind a request. */

import { bearerToken } from './http.js'

export interface AuthenticatedUser {
  readonly id: string
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
    getUser(jwt: string): Promise<{ data: { user: { id: string; aud?: string } | null }; error: unknown }>
  }
}

export function supabaseAuthenticator(client: SupabaseAuthLike): Authenticator {
  return {
    async verify(accessToken) {
      // Validated by Supabase Auth itself (signature, expiry, revocation).
      const { data, error } = await client.auth.getUser(accessToken)
      if (error || !data.user) return null
      if (data.user.aud && data.user.aud !== 'authenticated') return null
      return { id: data.user.id }
    },
  }
}
