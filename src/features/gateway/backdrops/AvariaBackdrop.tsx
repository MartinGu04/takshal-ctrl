import { memo } from 'react'

/**
 * Avaria, after the real Avaria entry screen: black-purple base, deep violet atmosphere,
 * fine dotted grid, sparse faint stars, quiet circular geometry and a single heartbeat line.
 * Decorative only. Layers are sized to the viewport so the seam slides over them like a window.
 */

// Long and flat, with one pronounced beat and a small echo — as on the Avaria screen.
const TRACE = 'M0 100 L420 100 L446 100 L470 40 L500 160 L530 70 L548 100 L1000 100'

// Sparse, deterministic, faint.
const STARS = [
  [58, 12],
  [81, 22],
  [66, 71],
  [93, 58],
  [74, 88],
  [55, 42],
  [88, 8],
] as const

export const AvariaBackdrop = memo(function AvariaBackdrop() {
  return (
    <div className="backdrop backdrop--avaria" aria-hidden="true">
      <div className="av-base" />
      <div className="av-atmosphere" />
      <div className="av-grid" />
      {STARS.map(([x, y]) => (
        <span key={`${x}-${y}`} className="av-star" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      <svg className="av-corner-rings" viewBox="-100 -100 200 200" focusable="false">
        <circle r="99" />
        <circle r="74" />
        <circle r="49" />
      </svg>
      <svg className="av-trace" viewBox="0 0 1000 200" preserveAspectRatio="none" focusable="false">
        <path className="av-trace__base" d={TRACE} />
        <path className="av-trace__pulse" d={TRACE} pathLength={1} />
      </svg>
      <div className="backdrop__grain" />
      <div className="backdrop__vignette" />
      <div className="backdrop__scrim" />
    </div>
  )
})
