/**
 * Web Push capability detection — by feature, not by user agent.
 *
 * iOS/iPadOS only expose PushManager to web apps opened from the Home Screen. There,
 * `navigator.standalone` exists (a WebKit-specific property) but is false in a Safari tab, which
 * is how "install first" is detected without sniffing the user agent.
 */

export interface SupportEnv {
  readonly isSecureContext: boolean
  readonly hasServiceWorker: boolean
  readonly hasPushManager: boolean
  readonly hasNotification: boolean
  readonly isStandalone: boolean
  /** Whether the platform exposes `navigator.standalone` (iOS/iPadOS Home Screen web apps). */
  readonly hasStandaloneFlag: boolean
}

export type SupportLevel = 'supported' | 'install-required' | 'unsupported'

export function readSupportEnv(win: Window & typeof globalThis = window): SupportEnv {
  const nav = win.navigator as Navigator & { standalone?: boolean }
  const displayStandalone = typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches
  return {
    isSecureContext: win.isSecureContext === true,
    hasServiceWorker: 'serviceWorker' in nav,
    hasPushManager: 'PushManager' in win,
    hasNotification: 'Notification' in win,
    isStandalone: displayStandalone || nav.standalone === true,
    hasStandaloneFlag: 'standalone' in nav,
  }
}

export function evaluateSupport(env: SupportEnv): SupportLevel {
  if (!env.isSecureContext || !env.hasServiceWorker) return 'unsupported'
  if (env.hasPushManager && env.hasNotification) return 'supported'
  if (env.hasStandaloneFlag && !env.isStandalone) return 'install-required'
  return 'unsupported'
}

/** A short, human label for this device ("iPhone · Home Screen"), for the user's device list. */
export function describeDevice(win: Window & typeof globalThis = window): string {
  const env = readSupportEnv(win)
  const nav = win.navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } }
  const platform = nav.userAgentData?.platform || (env.hasStandaloneFlag ? 'iOS' : 'Web')
  return `${platform}${env.isStandalone ? ' · Home Screen' : ' · Browser'}`.slice(0, 64)
}
