/**
 * Decorative geometry drawn directly behind each system's logo, echoing its real entry screen:
 * concentric targeting rings for Avaria, a radial dial with a sweep for המחלבה.
 * Rendered inside the heading so it tracks the logo as the split moves.
 */

export function AvariaHalo() {
  return (
    <span className="halo halo--avaria" aria-hidden="true">
      <span className="halo__line" />
      <svg className="halo__rings" viewBox="-100 -100 200 200" focusable="false">
        <circle r="99" className="halo__ring halo__ring--outer" />
        <circle r="78" className="halo__ring" />
        <circle r="57" className="halo__ring halo__ring--inner" />
      </svg>
    </span>
  )
}

const DIAL_TICKS = Array.from({ length: 60 }, (_, i) => i * 6)
// Leave the bottom of the dial open where the המחלבה wordmark sits.
const inGap = (deg: number) => deg > 128 && deg < 232

export function MachlavaHalo() {
  return (
    <span className="halo halo--machlava" aria-hidden="true">
      <span className="halo__sweep-mask">
        <span className="halo__sweep" />
      </span>
      <svg className="halo__dial" viewBox="-100 -100 200 200" focusable="false">
        {DIAL_TICKS.filter((deg) => !inGap(deg)).map((deg) => (
          <line
            key={deg}
            y1={-99}
            y2={deg % 30 === 0 ? -89 : -94}
            className={deg % 30 === 0 ? 'halo__tick halo__tick--major' : 'halo__tick'}
            transform={`rotate(${deg})`}
          />
        ))}
      </svg>
    </span>
  )
}
