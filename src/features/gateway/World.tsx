import type { ComponentType, FocusEvent, MouseEvent, PointerEvent } from 'react'
import type { SystemDefinition, SystemId } from '../../config/systems'
import { hintOrigin } from '../../lib/resourceHints'
import { AvariaBackdrop } from './backdrops/AvariaBackdrop'
import { MachlavaBackdrop } from './backdrops/MachlavaBackdrop'

export type WorldState = 'idle' | 'active' | 'receded' | 'launching' | 'dormant'

interface WorldProps {
  readonly system: SystemDefinition
  readonly state: WorldState
  /** When false (reduced motion), links behave as plain same-tab links with no hand-off transition. */
  readonly interceptNavigation: boolean
  readonly onHover: (id: SystemId, on: boolean) => void
  readonly onFocus: (id: SystemId, on: boolean) => void
  readonly onLaunch: (id: SystemId, href: string) => void
}

const BACKDROPS = {
  avaria: AvariaBackdrop,
  machlava: MachlavaBackdrop,
} satisfies Record<SystemId, ComponentType>

/** Hover emphasis is for real pointers only; touch gets feedback from the tap itself. */
function canHover(event: PointerEvent) {
  return event.pointerType !== 'touch' && window.matchMedia('(hover: hover)').matches
}

function isPlainPrimaryClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

export function World({ system, state, interceptNavigation, onHover, onFocus, onLaunch }: WorldProps) {
  const { id, destination } = system
  const Backdrop = BACKDROPS[id]
  const titleId = `${id}-title`

  const warmUp = () => {
    if (destination.ok) hintOrigin(destination.origin, 'preconnect')
  }

  const handlePointerEnter = (event: PointerEvent) => {
    if (!canHover(event)) return
    onHover(id, true)
    warmUp()
  }

  const handlePointerLeave = (event: PointerEvent) => {
    if (!canHover(event)) return
    onHover(id, false)
  }

  const handleFocus = () => {
    onFocus(id, true)
    warmUp()
  }

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocus(id, false)
  }

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!destination.ok || !interceptNavigation || event.defaultPrevented || !isPlainPrimaryClick(event)) return
    event.preventDefault()
    onLaunch(id, destination.href)
  }

  return (
    // Pointer/focus handlers only mirror emphasis for the link inside; they are not an interaction of their own.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      className={`world world--${id}`}
      data-state={state}
      aria-labelledby={titleId}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <Backdrop />

      <div className="world__content">
        <div className="world__identity">
          <h2 id={titleId} className="world__title">
            <img
              className="world__logo"
              src={system.logo.src}
              width={system.logo.width}
              height={system.logo.height}
              alt={system.name}
              decoding="async"
              fetchPriority="high"
              draggable={false}
            />
          </h2>

          {system.tagline && <p className="world__tagline">{system.tagline}</p>}
        </div>

        {destination.ok ? (
          // Labelled by the nested .cta__label text, which the rule cannot see through.
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label
          <a className={`cta cta--${id}`} href={destination.href} onClick={handleClick}>
            <span className="cta__frame">
              <span className="cta__corners" aria-hidden="true" />
              <span className="cta__label">{system.ctaLabel}</span>
              <svg className="cta__arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
              </svg>
            </span>
          </a>
        ) : (
          <p className={`cta cta--${id} cta--unavailable`}>
            <span className="cta__frame">
              <span className="cta__label">{system.ctaLabel}</span>
            </span>
            <span className="cta__note">כתובת היעד טרם הוגדרה</span>
          </p>
        )}

        <p className="world__route" dir="ltr" aria-live="polite">
          {destination.ok ? (
            <>
              <span className="world__route-label">{state === 'launching' ? 'CONNECTING' : 'ROUTE'}</span>
              <span className="world__route-host">{destination.host}</span>
            </>
          ) : (
            <span className="world__route-label">NO ROUTE</span>
          )}
        </p>
      </div>
    </section>
  )
}
