import type { Authenticator } from '../auth.js'
import type { HubDeps } from '../handlers.js'
import type { PushSender, SendOutcome } from '../sender.js'
import { memoryStore } from './memoryStore.js'

// Well-formed key material (public test vectors, not real device secrets).
export const P256DH = 'BIPUL12DLfytvTajnryr2PRdAgXS3HGKiLqndGcJGabyhHheJYlNGCeXl1dn18gSJ1WAkAPIxr4gK0_dQds4yiI'
export const AUTH = 'FPssNDTKnInHVndSTdbKFw'

export const subscriptionJson = (endpoint = 'https://fcm.googleapis.com/fcm/send/device-a') => ({
  endpoint,
  expirationTime: null,
  keys: { p256dh: P256DH, auth: AUTH },
})

export const TOKENS: Record<string, string> = { 'token-alice': 'user-alice', 'token-bob': 'user-bob' }

export const fakeAuthenticator: Authenticator = {
  async verify(token) {
    const id = TOKENS[token]
    return id ? { id } : null
  },
}

export function fakeSender(outcomeFor: (endpoint: string) => SendOutcome = () => ({ kind: 'delivered' })) {
  const sent: { endpoint: string; payload: unknown }[] = []
  const sender: PushSender = {
    async send(subscription, payload) {
      sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) })
      return outcomeFor(subscription.endpoint)
    },
  }
  return { sender, sent }
}

export function setupHub(options: { outcomeFor?: (endpoint: string) => SendOutcome; now?: () => number } = {}) {
  const now = options.now ?? (() => Date.parse('2026-09-25T12:00:00Z'))
  const { store, rows, events } = memoryStore(now)
  const { sender, sent } = fakeSender(options.outcomeFor)
  const logs: string[] = []
  const deps: HubDeps = { authenticator: fakeAuthenticator, store, sender, now, log: (message) => logs.push(message) }
  return { deps, rows, events, sent, logs }
}

export function request(path: string, body: unknown, options: { token?: string; method?: string; contentType?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': options.contentType ?? 'application/json' }
  if (options.token) headers.authorization = `Bearer ${options.token}`
  return new Request(`https://ctrl.example${path}`, {
    method: options.method ?? 'POST',
    headers,
    ...(options.method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })
}
