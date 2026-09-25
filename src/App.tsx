import { useEffect, useMemo } from 'react'
import { systemsFromEnv } from './config/systems'
import { Gateway } from './features/gateway/Gateway'
import { OpenHandoff } from './features/handoff/OpenHandoff'
import { NotificationControl } from './features/notifications/NotificationControl'
import { HANDOFF_PATH } from './shared/notifications/handoff'
import { hintOrigin } from './lib/resourceHints'

/**
 * Application shell. The gateway is the portal; the notification control sits beside it as a
 * separate layer. `/open` is the notification-click hand-off route.
 */
export function App() {
  const systems = useMemo(() => systemsFromEnv(), [])
  const isHandoff = window.location.pathname === HANDOFF_PATH

  useEffect(() => {
    for (const { destination, id } of systems) {
      if (destination.ok) hintOrigin(destination.origin, 'dns-prefetch')
      else if (import.meta.env.DEV) console.warn(`[takshal-ctrl] ${id}: destination ${destination.reason}`)
    }
  }, [systems])

  if (isHandoff) return <OpenHandoff systems={systems} />

  return (
    <>
      <Gateway systems={systems} />
      <NotificationControl />
    </>
  )
}
