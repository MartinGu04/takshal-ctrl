/** Production wiring for the hub (Supabase + web-push). Created once per server instance. */

import { createClient } from '@supabase/supabase-js'
import { supabaseAuthenticator } from './auth.js'
import { readHubEnv, type EnvSource } from './env.js'
import type { HubDeps } from './handlers.js'
import { webPushSender } from './sender.js'
import { supabaseStore } from './store.supabase.js'

let cached: HubDeps | null | undefined

export function hubDeps(env: EnvSource = process.env): HubDeps | null {
  if (cached !== undefined) return cached
  const config = readHubEnv(env)
  if (!config.ok) {
    console.warn(`[hub] not configured; missing: ${config.missing.join(', ')}`)
    cached = null
    return cached
  }
  const { supabaseUrl, supabaseSecretKey, vapidPublicKey, vapidPrivateKey, vapidSubject } = config.value
  const db = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  cached = {
    authenticator: supabaseAuthenticator(db),
    store: supabaseStore(db),
    sender: webPushSender({ publicKey: vapidPublicKey, privateKey: vapidPrivateKey, subject: vapidSubject }),
    log: (message) => console.info(message),
  }
  return cached
}
