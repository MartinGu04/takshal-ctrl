import { hubApi } from './api'
import { supabaseAuth } from './auth'
import { readNotificationConfig } from './config'
import { NotificationController } from './controller'
import { browserPush } from './pushClient'
import { describeDevice, evaluateSupport, readSupportEnv } from './support'

/** The production controller for this device. */
export function createNotificationController(): NotificationController {
  const config = readNotificationConfig()
  return new NotificationController({
    config,
    support: () => evaluateSupport(readSupportEnv()),
    auth: () => {
      if (!config) throw new Error('notifications not configured')
      return supabaseAuth(config)
    },
    push: browserPush,
    api: hubApi,
    deviceLabel: () => describeDevice(),
  })
}
