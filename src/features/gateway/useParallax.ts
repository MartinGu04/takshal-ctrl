import { useEffect, type RefObject } from 'react'

/** Time constant of the easing toward the pointer: enough inertia to read as depth, never as lag. */
const SMOOTHING_MS = 220
const SETTLED = 0.0005

/** Maps a coordinate to -1…1 around the centre of the given extent. */
const toUnit = (value: number, extent: number) => Math.max(-1, Math.min(1, (value / extent) * 2 - 1))

/**
 * Micro-parallax. Eases the pointer position into --px / --py (-1…1, relative to the viewport
 * centre) on the given element; backdrop layers turn that into a few pixels of drift at their own
 * depth (see gateway.css). Only writes two custom properties per frame — no layout reads — and the
 * frame loop stops as soon as it settles.
 */
export function useParallax(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return

    let width = window.innerWidth
    let height = window.innerHeight
    let targetX = 0
    let targetY = 0
    let x = 0
    let y = 0
    let frame = 0
    let lastTime = 0

    const step = (time: number) => {
      const dt = lastTime ? Math.min(time - lastTime, 64) : 16
      lastTime = time
      const k = 1 - Math.exp(-dt / SMOOTHING_MS)
      x += (targetX - x) * k
      y += (targetY - y) * k
      el.style.setProperty('--px', x.toFixed(4))
      el.style.setProperty('--py', y.toFixed(4))
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > SETTLED) {
        frame = requestAnimationFrame(step)
      } else {
        frame = 0
        lastTime = 0
      }
    }

    const aimAt = (nextX: number, nextY: number) => {
      targetX = nextX
      targetY = nextY
      if (!frame) frame = requestAnimationFrame(step)
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      aimAt(toUnit(event.clientX, width), toUnit(event.clientY, height))
    }
    // The pointer left the window (or the window lost focus): drift home.
    const onOut = (event: MouseEvent) => {
      if (!event.relatedTarget) aimAt(0, 0)
    }
    const recentre = () => aimAt(0, 0)
    const onResize = () => {
      width = window.innerWidth
      height = window.innerHeight
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('mouseout', onOut)
    window.addEventListener('blur', recentre)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('mouseout', onOut)
      window.removeEventListener('blur', recentre)
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(frame)
      el.style.removeProperty('--px')
      el.style.removeProperty('--py')
    }
  }, [ref, enabled])
}
