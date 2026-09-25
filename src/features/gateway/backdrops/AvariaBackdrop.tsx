import { memo } from 'react'

/**
 * Avaria: near-black navy, violet and a touch of magenta — the language of the real Avaria
 * login screen: dotted technical grid, radar rings, heartbeat/signal line. Decorative only.
 * Layers are sized to the viewport (not the half) so the seam slides over them like a window.
 */

// A mostly flat signal with sparse, sharp excursions — echoes the heartbeat in the Avaria mark.
const TRACE =
  'M0 120 L140 120 L150 112 L160 128 L170 120 L330 120 L338 120 L344 70 L352 168 L360 104 L368 120 ' +
  'L520 120 L530 116 L540 124 L550 120 L700 120 L706 120 L712 40 L720 190 L728 92 L736 132 L744 120 L1000 120'

const RADAR_TICKS = Array.from({ length: 72 }, (_, i) => i * 5)

function Radar() {
  return (
    <div className="av-radar">
      <div className="av-radar__sweep" />
      <svg className="av-radar__rings" viewBox="0 0 200 200" focusable="false">
        <circle cx="100" cy="100" r="98" className="av-radar__ring av-radar__ring--outer" />
        <circle cx="100" cy="100" r="74" className="av-radar__ring" />
        <circle cx="100" cy="100" r="50" className="av-radar__ring av-radar__ring--dotted" />
        <circle cx="100" cy="100" r="26" className="av-radar__ring" />
        <path className="av-radar__cross" d="M100 2V198M2 100H198" />
        <g className="av-radar__ticks">
          {RADAR_TICKS.map((deg) => (
            <line key={deg} x1="100" y1="2" x2="100" y2={deg % 30 === 0 ? 8 : 5} transform={`rotate(${deg} 100 100)`} />
          ))}
        </g>
        <circle cx="136" cy="62" r="2" className="av-radar__blip" />
      </svg>
    </div>
  )
}

export const AvariaBackdrop = memo(function AvariaBackdrop() {
  return (
    <div className="backdrop backdrop--avaria" aria-hidden="true">
      <div className="av-base" />
      <div className="av-grid" />
      <div className="av-glow" />
      <Radar />
      <div className="av-scan" />
      <div className="av-ruler" />
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
