import patchSatcom from '../../assets/brand/502-satcom.webp'
import patchStrategic from '../../assets/brand/502-strategic-communication.webp'

/** 502 insignia — a quiet secondary identity for the portal shell, never competing with the systems. */
function Insignia({ className }: { className: string }) {
  return (
    <div className={`insignia ${className}`}>
      <img src={patchStrategic} width={158} height={160} alt="סמל 502 Strategic Communication" decoding="async" />
      <img src={patchSatcom} width={158} height={160} alt="סמל 502" decoding="async" />
    </div>
  )
}

/**
 * The illuminated boundary between the two worlds, and the portal's own identity.
 * The wordmark is split by the beam itself: TAKSHAL ┃ CTRL.
 */
export function Seam() {
  return (
    <header className="seam">
      <div className="seam__beam" aria-hidden="true">
        <span className="seam__bloom seam__bloom--avaria" />
        <span className="seam__bloom seam__bloom--machlava" />
        <span className="seam__glow" />
        <span className="seam__core" />
        <span className="seam__ticks" />
        <span className="seam__packet" />
        <span className="seam__packet seam__packet--late" />
      </div>

      <div className="seam__node" aria-hidden="true">
        <span className="seam__arm seam__arm--avaria" />
        <span className="seam__arm seam__arm--machlava" />
      </div>

      <div className="brand" dir="ltr">
        <h1 className="brand__wordmark">
          <span className="brand__word brand__word--takshal">TAKSHAL</span>{' '}
          <span className="brand__gate" aria-hidden="true" />
          <span className="brand__word brand__word--ctrl">CTRL</span>
        </h1>
        <div className="brand__meta">
          <p className="brand__tagline">Unified Systems Access</p>
          {/* On narrow screens the insignia flank the tagline; on wide screens they sit at the foot of the seam. */}
          <Insignia className="insignia--brand" />
        </div>
      </div>

      <Insignia className="insignia--foot" />
    </header>
  )
}
