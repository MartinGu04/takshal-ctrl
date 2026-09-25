/**
 * Notification enrollment state machine for this device.
 *
 * Framework-agnostic and fully injectable: the UI only renders snapshots and calls actions.
 * Permission is requested exclusively from `enable()`, which the UI calls from a click.
 */

import type { HubApi } from './api'
import type { AuthPort, Session } from './auth'
import type { NotificationConfig } from './config'
import type { PushPort, PushSubscriptionLike } from './pushClient'
import type { SupportLevel } from './support'

export type NotificationStatus =
  | 'checking'
  | 'not-configured'
  | 'unsupported'
  | 'install-required'
  | 'signed-out'
  | 'ready'
  | 'requesting'
  | 'enabled'
  | 'denied'
  | 'error'

export type Feedback = 'test-sent' | 'test-rate-limited' | 'test-failed' | 'disabled' | null

export interface NotificationSnapshot {
  readonly status: NotificationStatus
  readonly email: string | null
  readonly devices: number | null
  readonly busy: boolean
  readonly feedback: Feedback
}

export interface ControllerDeps {
  readonly config: NotificationConfig | null
  readonly support: () => SupportLevel
  /** Created lazily: only when the user actually engages with notifications. */
  readonly auth: () => AuthPort
  readonly push: PushPort
  readonly api: HubApi
  readonly deviceLabel: () => string | null
}

const INITIAL: NotificationSnapshot = { status: 'checking', email: null, devices: null, busy: false, feedback: null }

export class NotificationController {
  private snapshot: NotificationSnapshot = INITIAL
  private readonly listeners = new Set<(snapshot: NotificationSnapshot) => void>()
  private authPort: AuthPort | null = null
  private readonly deps: ControllerDeps

  constructor(deps: ControllerDeps) {
    this.deps = deps
  }

  get state(): NotificationSnapshot {
    return this.snapshot
  }

  subscribe(listener: (snapshot: NotificationSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<NotificationSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener(this.snapshot)
  }

  private auth(): AuthPort {
    this.authPort ??= this.deps.auth()
    return this.authPort
  }

  /** Cheap, local-only check (no auth client, no network): is this device already subscribed? */
  async hasLocalSubscription(): Promise<boolean> {
    if (!this.deps.config || this.deps.support() !== 'supported') return false
    try {
      return this.deps.push.permission() === 'granted' && (await this.deps.push.getSubscription()) !== null
    } catch {
      return false
    }
  }

  /** Full evaluation. Also re-persists an existing local subscription the server has lost. */
  async refresh(): Promise<NotificationSnapshot> {
    const { config, support, push, api } = this.deps
    if (!config) return this.finish({ status: 'not-configured' })

    const level = support()
    if (level === 'unsupported') return this.finish({ status: 'unsupported' })
    if (level === 'install-required') return this.finish({ status: 'install-required' })
    if (push.permission() === 'denied') return this.finish({ status: 'denied', email: null })

    let session: Session | null
    try {
      session = await this.auth().getSession()
    } catch {
      return this.finish({ status: 'error' })
    }
    if (!session) return this.finish({ status: 'signed-out', email: null, devices: null })

    const local = push.permission() === 'granted' ? await push.getSubscription().catch(() => null) : null
    if (!local) return this.finish({ status: 'ready', email: session.email })

    const status = await api.status(session.accessToken, local.endpoint)
    if (status.ok && status.data.registered) return this.finish({ status: 'enabled', email: session.email, devices: status.data.devices })

    // Resubscribe: the browser still holds a subscription that the hub no longer has.
    const saved = await api.subscribe(session.accessToken, local.toJSON(), this.deps.deviceLabel())
    return this.finish(saved.ok ? { status: 'enabled', email: session.email } : { status: 'ready', email: session.email })
  }

  private finish(patch: Partial<NotificationSnapshot>): NotificationSnapshot {
    this.set({ busy: false, ...patch })
    return this.snapshot
  }

  async signIn(): Promise<void> {
    this.set({ busy: true, feedback: null })
    try {
      await this.auth().signIn() // navigates away to Google
    } catch {
      this.finish({ status: 'error' })
    }
  }

  /**
   * Enables notifications on this device. MUST be called directly from a user gesture:
   * the permission prompt is triggered synchronously, before anything else is awaited.
   */
  async enable(): Promise<NotificationSnapshot> {
    const { config, push, api } = this.deps
    if (!config) return this.finish({ status: 'not-configured' })

    const permissionRequest = push.permission() === 'granted' ? Promise.resolve<NotificationPermission>('granted') : push.requestPermission()
    this.set({ status: 'requesting', busy: true, feedback: null })

    let permission: NotificationPermission
    try {
      permission = await permissionRequest
    } catch {
      return this.finish({ status: 'error' })
    }
    if (permission === 'denied') return this.finish({ status: 'denied' })
    if (permission !== 'granted') return this.finish({ status: 'ready' })

    try {
      const session = await this.auth().getSession()
      if (!session) return this.finish({ status: 'signed-out' })
      const subscription: PushSubscriptionLike = await push.subscribe(config.vapidPublicKey)
      const saved = await api.subscribe(session.accessToken, subscription.toJSON(), this.deps.deviceLabel())
      if (!saved.ok) {
        if (saved.status === 401) return this.finish({ status: 'signed-out' })
        return this.finish({ status: 'error' })
      }
      return this.refresh()
    } catch {
      return this.finish({ status: 'error' })
    }
  }

  /** Removes this device: from the hub first, then from the browser. */
  async disable(): Promise<NotificationSnapshot> {
    this.set({ busy: true, feedback: null })
    try {
      const subscription = await this.deps.push.getSubscription()
      const session = await this.auth().getSession()
      if (subscription && session) {
        const removed = await this.deps.api.unsubscribe(session.accessToken, subscription.endpoint)
        if (!removed.ok && removed.status !== 404) return this.finish({ status: 'error' })
      }
      await subscription?.unsubscribe()
      await this.refresh()
      return this.finish({ feedback: 'disabled' })
    } catch {
      return this.finish({ status: 'error' })
    }
  }

  /** Sends the signed-in user a test notification on this device. The server picks the recipient. */
  async sendTest(): Promise<NotificationSnapshot> {
    this.set({ busy: true, feedback: null })
    try {
      const [session, subscription] = await Promise.all([this.auth().getSession(), this.deps.push.getSubscription()])
      if (!session) return this.finish({ status: 'signed-out' })
      const result = await this.deps.api.test(session.accessToken, subscription?.endpoint ?? null)
      if (result.ok) return this.finish({ feedback: result.data.delivered > 0 ? 'test-sent' : 'test-failed' })
      if (result.status === 429) return this.finish({ feedback: 'test-rate-limited' })
      if (result.status === 404) return this.refresh()
      return this.finish({ feedback: 'test-failed' })
    } catch {
      return this.finish({ feedback: 'test-failed' })
    }
  }

  /** Signing out also removes this device, so a shared device stops receiving your notifications. */
  async signOut(): Promise<NotificationSnapshot> {
    this.set({ busy: true, feedback: null })
    try {
      const subscription = await this.deps.push.getSubscription()
      const session = await this.auth().getSession()
      if (subscription && session) await this.deps.api.unsubscribe(session.accessToken, subscription.endpoint)
      await subscription?.unsubscribe()
      await this.auth().signOut()
    } catch {
      // Fall through to a fresh evaluation either way.
    }
    return this.refresh()
  }

  watchAuth(): () => void {
    if (!this.deps.config) return () => {}
    return this.auth().onChange(() => void this.refresh())
  }
}
