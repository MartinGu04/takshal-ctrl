import type { ComponentType, MouseEvent, PointerEvent } from 'react'
import type { SystemDefinition, SystemId } from '../../config/systems'
import { hintOrigin } from '../../lib/resourceHints'
import { AvariaBackdrop } from './backdrops/AvariaBackdrop'
import { MachlavaBackdrop } from './backdrops/MachlavaBackdrop'
import { AvariaHalo, MachlavaHalo } from './backdrops/Halos'

export type WorldState = 'idle' | 'active' | 'receded' | 'launching' | 'dormant'

interface WorldProps {
  readonly system: SystemDefinition
  readonly state: WorldState
  /** When false (reduced motion), links behave as plain same-tab links with no hand-off transition. */
  readonly interceptNavigation: boolean
  readonly onHover: (id: SystemId, on: boolean) => void
  /** Focus entered this world. Gateway releases it when focus leaves the gateway altogether. */
  readonly onFocus: (id: SystemId) => void
  readonly onLaunch: (id: SystemId, href: string) => void
}

const BACKDROPS = {
  avaria: AvariaBackdrop,
  machlava: MachlavaBackdrop,
} satisfies Record<SystemId, ComponentType>

const HALOS = {
  avaria: AvariaHalo,
  machlava: MachlavaHalo,
} satisfies Record<SystemId, ComponentType>

/**
 * Hover emphasis is for real pointers only; touch gets feedback from the tap itself.
 * `any-hover`, not `hover`: a touchscreen laptop can report touch as its primary input
 * while the user is on a mouse or trackpad.
 */
function canHover(event: PointerEvent) {
  return event.pointerType !== 'touch' && window.matchMedia('(any-hover: hover)').matches
}

function isPlainPrimaryClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

export function World({ system, state, interceptNavigation, onHover, onFocus, onLaunch }: WorldProps) {
  const { id, destination } = system
  const Backdrop = BACKDROPS[id]
  const Halo = HALOS[id]
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
    onFocus(id)
    warmUp()
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
    >
      <Backdrop />

      <div className="world__content">
        <div className="world__identity">
          <h2 id={titleId} className="world__title">
            <Halo />
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

        {/* The hand-off is visual; announce it for assistive technology too. */}
        <output className="visually-hidden">{state === 'launching' ? `מתחבר ל־${system.name}…` : ''}</output>
      </div>
    </section>
  )
}
