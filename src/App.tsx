import { useEffect, useMemo } from 'react'
import { systemsFromEnv } from './config/systems'
import { Gateway } from './features/gateway/Gateway'
import { hintOrigin } from './lib/resourceHints'

/**
 * Application shell. Cross-cutting layers (e.g. a future notification centre or
 * PWA install prompt) mount here, beside the gateway, without touching it.
 */
export function App() {
  const systems = useMemo(() => systemsFromEnv(), [])

  useEffect(() => {
    for (const { destination, id } of systems) {
      if (destination.ok) hintOrigin(destination.origin, 'dns-prefetch')
      else if (import.meta.env.DEV) console.warn(`[takshal-ctrl] ${id}: destination ${destination.reason}`)
    }
  }, [systems])

  return <Gateway systems={systems} />
}
