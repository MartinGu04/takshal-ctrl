import { useState } from 'react'
import type { SystemId } from '../../config/systems'

/**
 * Reports whether emphasis arrived straight from the other world (A → B, with no idle state
 * between), so the split can flow through the centre as one movement instead of two unrelated
 * hover states. Returns the world that was crossed to, until emphasis next changes; else null.
 */
export function useCrossing(active: SystemId | null): SystemId | null {
  // Derived from the previous render's value (React's "adjust state while rendering" pattern).
  const [trail, setTrail] = useState<{ active: SystemId | null; crossing: SystemId | null }>({
    active,
    crossing: null,
  })

  if (trail.active !== active) {
    const crossing = trail.active !== null && active !== null ? active : null
    setTrail({ active, crossing })
    return crossing
  }
  return trail.crossing
}
