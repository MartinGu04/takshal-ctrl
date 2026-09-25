/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Entry URL for Avaria. Absolute http(s) URL or same-origin path. */
  readonly VITE_AVARIA_URL?: string
  /** Entry URL for המחלבה. Absolute http(s) URL or same-origin path. */
  readonly VITE_MACHLAVA_URL?: string
  /** Supabase project URL (public). Enables Google sign-in for notification enrollment. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon / publishable key (public; all hub tables are closed to it by RLS). */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** VAPID public key (base64url). The private key is server-only. */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
