import { memo } from 'react'

/**
 * Avaria: graphite, amber, diagnostic. Everything here is decorative.
 * Layers are sized to the viewport (not the half) so the seam slides over them like a window.
 */

// A mostly flat signal with sparse, sharp excursions — reads as monitoring, not as a heartbeat.
const TRACE =
  'M0 120 L140 120 L150 112 L160 128 L170 120 L330 120 L338 120 L344 70 L352 168 L360 104 L368 120 ' +
  'L520 120 L530 116 L540 124 L550 120 L700 120 L706 120 L712 40 L720 190 L728 92 L736 132 L744 120 L1000 120'

function Reticle() {
  return (
    <svg className="av-reticle" viewBox="0 0 120 120" focusable="false">
      <circle cx="60" cy="60" r="34" className="av-reticle__ring" />
      <circle cx="60" cy="60" r="2" className="av-reticle__dot" />
      <path className="av-reticle__cross" d="M60 14v24M60 82v24M14 60h24M82 60h24" />
      <path className="av-reticle__brackets" d="M8 22V8h14M98 8h14v14M112 98v14H98M22 112H8V98" />
      <g className="av-reticle__sweep">
        <path d="M60 26a34 34 0 0 1 29.4 17" />
      </g>
    </svg>
  )
}

function Readouts() {
  return (
    <dl className="av-readouts" dir="ltr">
      <div>
        <dt>DIAG.SEQ</dt>
        <dd>07/12</dd>
      </div>
      <div>
        <dt>CH-A</dt>
        <dd>0.82</dd>
      </div>
      <div>
        <dt>THRESHOLD</dt>
        <dd>0.75</dd>
      </div>
    </dl>
  )
}

export const AvariaBackdrop = memo(function AvariaBackdrop() {
  return (
    <div className="backdrop backdrop--avaria" aria-hidden="true">
      <div className="av-base" />
      <div className="av-grid" />
      <div className="av-glow" />
      <div className="av-scan" />
      <div className="av-ruler" />
      <Reticle />
      <svg className="av-trace" viewBox="0 0 1000 200" preserveAspectRatio="none" focusable="false">
        <path className="av-trace__base" d={TRACE} />
        <path className="av-trace__pulse" d={TRACE} pathLength={1} />
      </svg>
      <Readouts />
      <div className="av-hazard" />
      <div className="backdrop__grain" />
      <div className="backdrop__vignette" />
      <div className="backdrop__scrim" />
    </div>
  )
})
