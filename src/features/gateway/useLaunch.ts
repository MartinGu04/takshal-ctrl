import { useCallback, useEffect, useRef, useState } from 'react'
import type { SystemId } from '../../config/systems'

export type Navigate = (href: string) => void

export const navigateInSameTab: Navigate = (href) => window.location.assign(href)

/**
 * Just long enough for the click to register as a pulse through the chosen world. Navigation then
 * starts while the hand-off keeps playing: this page stays on screen until the destination responds,
 * so the transition overlaps the network wait instead of adding to it.
 */
export const LAUNCH_DELAY_MS = 180

/**
 * Plays the hand-off transition and navigates in the same tab shortly after it starts.
 * Resets when the page is restored from the back/forward cache.
 */
export function useLaunch(navigate: Navigate, delayMs = LAUNCH_DELAY_MS) {
  const [launching, setLaunching] = useState<SystemId | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLaunching(null)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      window.clearTimeout(timer.current)
    }
  }, [])

  const launch = useCallback(
    (id: SystemId, href: string) => {
      if (timer.current !== undefined) return
      setLaunching(id)
      timer.current = window.setTimeout(() => {
        timer.current = undefined
        navigate(href)
      }, delayMs)
    },
    [navigate, delayMs],
  )

  return { launching, launch }
}
