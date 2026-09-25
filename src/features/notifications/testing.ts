/** Test doubles for the notification controller's ports. */

import type { HubApi, HubResult } from './api'
import type { AuthPort, Session } from './auth'
import { NotificationController, type ControllerDeps } from './controller'
import type { PushPort, PushSubscriptionLike } from './pushClient'
import type { SupportLevel } from './support'

export const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/this-device'

export function fakeSubscription(endpoint = ENDPOINT): PushSubscriptionLike & { unsubscribed: boolean } {
  const sub = {
    endpoint,
    unsubscribed: false,
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: async () => {
      sub.unsubscribed = true
      return true
    },
  }
  return sub
}

export interface Fakes {
  session: Session | null
  permission: NotificationPermission
  permissionAnswer: NotificationPermission
  subscription: ReturnType<typeof fakeSubscription> | null
  support: SupportLevel
  registered: boolean
  calls: string[]
  testResult: HubResult<{ delivered: number; failed: number; removed: number }>
  subscribeResult: HubResult<{ subscription: { id: string } }>
}

export function createFakes(overrides: Partial<Fakes> = {}): Fakes {
  return {
    session: { accessToken: 'token', email: 'user@example.com' },
    permission: 'default',
    permissionAnswer: 'granted',
    subscription: null,
    support: 'supported',
    registered: false,
    calls: [],
    testResult: { ok: true, data: { delivered: 1, failed: 0, removed: 0 } },
    subscribeResult: { ok: true, data: { subscription: { id: 's1' } } },
    ...overrides,
  }
}

export function fakeController(fakes: Fakes, config: ControllerDeps['config'] = { supabaseUrl: 'https://p.supabase.co', supabaseAnonKey: 'anon', vapidPublicKey: 'BKey' }) {
  const auth: AuthPort = {
    getSession: async () => fakes.session,
    signIn: async () => void fakes.calls.push('signIn'),
    signOut: async () => {
      fakes.calls.push('signOut')
      fakes.session = null
    },
    onChange: () => () => {},
  }
  const push: PushPort = {
    permission: () => fakes.permission,
    requestPermission: async () => {
      fakes.calls.push('requestPermission')
      fakes.permission = fakes.permissionAnswer
      return fakes.permissionAnswer
    },
    getSubscription: async () => (fakes.subscription && !fakes.subscription.unsubscribed ? fakes.subscription : null),
    subscribe: async (key) => {
      fakes.calls.push(`subscribe:${key}`)
      fakes.subscription = fakeSubscription()
      return fakes.subscription
    },
  }
  const api: HubApi = {
    subscribe: async (token, subscription) => {
      fakes.calls.push(`api.subscribe:${token}:${subscription.endpoint}`)
      if (fakes.subscribeResult.ok) fakes.registered = true
      return fakes.subscribeResult
    },
    unsubscribe: async (token, endpoint) => {
      fakes.calls.push(`api.unsubscribe:${token}:${endpoint}`)
      fakes.registered = false
      return { ok: true, data: { removed: true } }
    },
    status: async () => ({ ok: true, data: { registered: fakes.registered, devices: fakes.registered ? 1 : 0 } }),
    test: async (token, endpoint) => {
      fakes.calls.push(`api.test:${token}:${endpoint}`)
      return fakes.testResult
    },
  }
  return new NotificationController({ config, support: () => fakes.support, auth: () => auth, push, api, deviceLabel: () => 'Test · Browser' })
}
