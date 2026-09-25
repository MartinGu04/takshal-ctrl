import { memo, useMemo } from 'react'
import { seededRandom } from '../../../lib/random'

/**
 * המחלבה: deep navy space, SATCOM — orbits, satellites, stars and a dish, in the blue → violet
 * of the real המחלבה logo, which sits in front of this. Everything here is decorative.
 */

interface Star {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly o: number
  readonly tint: string
}

const TINTS = ['#ffffff', '#ffffff', '#ffffff', '#d6ddff', '#c2d8ff']

function makeStars(seed: number, count: number, minR: number, maxR: number): Star[] {
  const rand = seededRandom(seed)
  return Array.from({ length: count }, () => ({
    x: rand() * 1000,
    y: rand() * 1000,
    r: minR + rand() * (maxR - minR),
    o: 0.25 + rand() * 0.65,
    tint: TINTS[Math.floor(rand() * TINTS.length)] ?? '#ffffff',
  }))
}

function Starfield() {
  const { far, near, twinkle } = useMemo(
    () => ({
      far: makeStars(7, 150, 0.5, 1.1),
      near: makeStars(19, 40, 1, 1.8),
      twinkle: makeStars(42, 12, 1.4, 2.2),
    }),
    [],
  )

  return (
    <svg className="mc-stars" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" focusable="false">
      <g className="mc-stars__far">
        {far.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.tint} opacity={s.o * 0.8} />
        ))}
      </g>
      <g className="mc-stars__near">
        {near.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.tint} opacity={s.o} />
        ))}
      </g>
      <g className="mc-stars__twinkle">
        {twinkle.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={s.tint}
            style={{ animationDelay: `${(i * 1.37) % 7}s`, animationDuration: `${5 + (i % 4)}s` }}
          />
        ))}
      </g>
    </svg>
  )
}

function Satellite({ angle, radius }: { angle: number; radius: number }) {
  return (
    <g transform={`rotate(${angle} 500 500) translate(500 ${500 - radius})`}>
      <circle r="9" className="mc-sat__halo" />
      <g className="mc-sat">
        <rect x="-2.6" y="-2" width="5.2" height="4" rx="0.6" />
        <path d="M-2.6 0h-2M2.6 0h2" />
        <rect x="-11" y="-2.2" width="6.4" height="4.4" className="mc-sat__panel" />
        <rect x="4.6" y="-2.2" width="6.4" height="4.4" className="mc-sat__panel" />
        <path d="M0-2v-3" />
      </g>
    </g>
  )
}

function Orbits() {
  return (
    <svg className="mc-orbits" viewBox="0 0 1000 1000" focusable="false">
      <defs>
        <linearGradient id="mc-orbit-fade" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5b8cff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#7aa2ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#9a7bff" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <circle cx="500" cy="500" r="210" className="mc-orbit mc-orbit--dotted" />
      <circle cx="500" cy="500" r="310" className="mc-orbit mc-orbit--solid" stroke="url(#mc-orbit-fade)" />
      <circle cx="500" cy="500" r="420" className="mc-orbit mc-orbit--dashed" />
      <circle cx="500" cy="500" r="488" className="mc-orbit mc-orbit--dotted mc-orbit--faint" />

      <g className="mc-orbit-spin mc-orbit-spin--a">
        <Satellite angle={18} radius={310} />
        <Satellite angle={138} radius={310} />
        <Satellite angle={258} radius={310} />
      </g>
      <g className="mc-orbit-spin mc-orbit-spin--b">
        <Satellite angle={62} radius={420} />
        <Satellite angle={242} radius={420} />
      </g>
    </svg>
  )
}

function Dish() {
  return (
    <svg className="mc-dish" viewBox="0 0 220 200" focusable="false">
      <defs>
        <linearGradient id="mc-dish-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a9c2ff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#23398a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#081030" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <g className="mc-dish__signal">
        <path d="M138.5 63.5A20 20 0 0 1 151.8 73.9" />
        <path d="M141.6 49.9A34 34 0 0 1 164.3 67.6" />
        <path d="M144.8 36.2A48 48 0 0 1 176.8 61.2" />
      </g>

      <path className="mc-dish__ground" d="M10 190H210" />
      <path className="mc-dish__mount" d="M86 190l10-44h14l10 44" />
      <circle className="mc-dish__joint" cx="103" cy="138" r="6" />

      <g transform="translate(103 122) rotate(38)">
        <path className="mc-dish__bowl" d="M-64 0Q0 48 64 0Z" />
        <path className="mc-dish__rim" d="M-64 0H64" />
        <path className="mc-dish__struts" d="M-58 0L0-50M58 0L0-50M0 22V-50" />
        <rect className="mc-dish__feed" x="-4" y="-58" width="8" height="10" rx="1.5" />
      </g>
    </svg>
  )
}

export const MachlavaBackdrop = memo(function MachlavaBackdrop() {
  return (
    <div className="backdrop backdrop--machlava" aria-hidden="true">
      <div className="mc-base" />
      <div className="mc-nebula" />
      <div className="mc-dots" />
      <Starfield />
      <Orbits />
      <Dish />
      <div className="backdrop__grain" />
      <div className="backdrop__vignette" />
      <div className="backdrop__scrim" />
    </div>
  )
})
