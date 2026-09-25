/** Browser push primitives behind a small port, so the controller can be tested without a browser. */

export interface PushSubscriptionLike {
  readonly endpoint: string
  toJSON(): PushSubscriptionJSON
  unsubscribe(): Promise<boolean>
}

export interface PushPort {
  permission(): NotificationPermission
  requestPermission(): Promise<NotificationPermission>
  getSubscription(): Promise<PushSubscriptionLike | null>
  subscribe(vapidPublicKey: string): Promise<PushSubscriptionLike>
}

export const SERVICE_WORKER_URL = '/sw.js'

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Registers the push service worker. Safe to call repeatedly; never requests permission. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/', updateViaCache: 'none' })
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (!existing) await registerServiceWorker()
  return navigator.serviceWorker.ready
}

export const browserPush: PushPort = {
  permission: () => Notification.permission,
  // Must be invoked directly from a user gesture (the controller calls it first thing in enable()).
  requestPermission: () => Notification.requestPermission(),
  async getSubscription() {
    const registration = await navigator.serviceWorker.getRegistration('/')
    return (await registration?.pushManager.getSubscription()) ?? null
  },
  async subscribe(vapidPublicKey) {
    const registration = await readyRegistration()
    const existing = await registration.pushManager.getSubscription()
    if (existing) return existing
    return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidPublicKey) })
  },
}
