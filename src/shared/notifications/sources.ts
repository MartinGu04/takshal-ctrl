import type { SystemId } from '../destinations.js'

/** Who a notification is from. `system` is TAKSHAL CTRL itself (setup, tests, announcements). */
export type NotificationSource = SystemId | 'system'

export const NOTIFICATION_SOURCES: readonly NotificationSource[] = ['avaria', 'machlava', 'system']

export function isNotificationSource(value: unknown): value is NotificationSource {
  return typeof value === 'string' && (NOTIFICATION_SOURCES as readonly string[]).includes(value)
}

/** Systems a notification click may hand off to. */
export function isSystemId(value: unknown): value is SystemId {
  return value === 'avaria' || value === 'machlava'
}

/**
 * Trusted, same-origin notification branding per source. Payloads can never supply their own
 * icon: the icon is always derived from the (validated) source.
 */
export const SOURCE_BRANDING: Record<NotificationSource, { readonly icon: string; readonly name: string }> = {
  avaria: { icon: '/icons/notify-avaria-192.png', name: 'Avaria' },
  machlava: { icon: '/icons/notify-machlava-192.png', name: 'המחלבה' },
  system: { icon: '/icons/icon-192.png', name: 'TAKSHAL CTRL' },
}
