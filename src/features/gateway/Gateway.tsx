import { useCallback, useRef, useState, type FocusEvent } from 'react'
import type { SystemDefinition, SystemId } from '../../config/systems'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { Seam } from './Seam'
import { useCrossing } from './useCrossing'
import { navigateInSameTab, useLaunch, type Navigate } from './useLaunch'
import { useParallax } from './useParallax'
import { World, type WorldState } from './World'
import './gateway.css'

/** The side-by-side layout with a pointer that can hover: where the split and the parallax live. */
const POINTER_DESKTOP = '(any-hover: hover) and (min-width: 761px)'

interface GatewayProps {
  readonly systems: readonly SystemDefinition[]
  readonly navigate?: Navigate
}

export function Gateway({ systems, navigate = navigateInSameTab }: GatewayProps) {
  const reducedMotion = usePrefersReducedMotion()
  const parallax = useMediaQuery(POINTER_DESKTOP) && !reducedMotion
  const [hovered, setHovered] = useState<SystemId | null>(null)
  const [focused, setFocused] = useState<SystemId | null>(null)
  // Whichever input moved last leads: tabbing to a world wins over a resting mouse, and vice versa.
  const [lastInput, setLastInput] = useState<'pointer' | 'focus'>('pointer')
  const { launching, launch } = useLaunch(navigate)
  const root = useRef<HTMLElement>(null)

  const active = launching ?? (lastInput === 'focus' ? (focused ?? hovered) : (hovered ?? focused))
  const crossing = useCrossing(active)
  useParallax(root, parallax)

  const stateOf = (id: SystemId): WorldState => {
    if (launching) return launching === id ? 'launching' : 'dormant'
    if (!active) return 'idle'
    return active === id ? 'active' : 'receded'
  }

  const onHover = useCallback((id: SystemId, on: boolean) => {
    setHovered((current) => (on ? id : current === id ? null : current))
    if (on) setLastInput('pointer')
  }, [])

  const onFocus = useCallback((id: SystemId) => {
    setFocused(id)
    setLastInput('focus')
  }, [])

  // Tabbing between the worlds hands emphasis straight across (a crossing, not a drop to idle);
  // focus emphasis only lets go when focus leaves the gateway.
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null)
  }

  return (
    // onBlur only releases the emphasis mirrored from the links inside; it is not an interaction of its own.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <main
      ref={root}
      className="gateway"
      data-active={active ?? 'none'}
      data-crossing={(!launching && crossing) || undefined}
      data-launching={launching ?? undefined}
      data-parallax={parallax || undefined}
      onBlur={onBlur}
    >
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
