import { useCallback, useState } from 'react'
import type { SystemDefinition, SystemId } from '../../config/systems'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { Seam } from './Seam'
import { navigateInSameTab, useLaunch, type Navigate } from './useLaunch'
import { World, type WorldState } from './World'
import './gateway.css'

interface GatewayProps {
  readonly systems: readonly SystemDefinition[]
  readonly navigate?: Navigate
}

export function Gateway({ systems, navigate = navigateInSameTab }: GatewayProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [hovered, setHovered] = useState<SystemId | null>(null)
  const [focused, setFocused] = useState<SystemId | null>(null)
  const { launching, launch } = useLaunch(navigate)

  const active = launching ?? hovered ?? focused

  const stateOf = (id: SystemId): WorldState => {
    if (launching) return launching === id ? 'launching' : 'dormant'
    if (!active) return 'idle'
    return active === id ? 'active' : 'receded'
  }

  const onHover = useCallback((id: SystemId, on: boolean) => {
    setHovered((current) => (on ? id : current === id ? null : current))
  }, [])

  const onFocus = useCallback((id: SystemId, on: boolean) => {
    setFocused((current) => (on ? id : current === id ? null : current))
  }, [])

  return (
    <main className="gateway" data-active={active ?? 'none'} data-launching={launching ?? undefined}>
      <Seam />
      {systems.map((system) => (
        <World
          key={system.id}
          system={system}
          state={stateOf(system.id)}
          interceptNavigation={!reducedMotion}
          onHover={onHover}
          onFocus={onFocus}
          onLaunch={launch}
        />
      ))}
    </main>
  )
}
