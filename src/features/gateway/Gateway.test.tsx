import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSystems } from '../../config/systems'
import { Gateway } from './Gateway'
import { LAUNCH_DELAY_MS } from './useLaunch'

const BASE = 'https://ctrl.example.org/'
const configured = createSystems(
  { avariaUrl: 'https://avaria.example.com/', machlavaUrl: 'https://machlava.example.com/app' },
  BASE,
)

/**
 * Dispatches a click and reports whether the app prevented it. The click is then
 * cancelled at the document so jsdom doesn't attempt a real navigation.
 */
function clickAndCheckPrevented(target: HTMLElement, init: MouseEventInit) {
  let prevented: boolean | undefined
  const stop = (event: Event) => {
    prevented = event.defaultPrevented
    event.preventDefault()
  }
  document.addEventListener('click', stop)
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
  document.removeEventListener('click', stop)
  return prevented
}

function setup(systems = configured) {
  const navigate = vi.fn()
  const view = render(<Gateway systems={systems} navigate={navigate} />)
  const main = view.container.querySelector('main') as HTMLElement
  return { navigate, main, ...view }
}

const avariaLink = () => screen.getByRole('link', { name: 'כניסה ל־Avaria' })
const machlavaLink = () => screen.getByRole('link', { name: 'כניסה להמחלבה' })
const region = (name: string) => screen.getByRole('region', { name })
const mouse = { pointerType: 'mouse' }

/** Answers media queries with the given predicate (jsdom otherwise matches nothing). */
const realMatchMedia = window.matchMedia
function mockMedia(matches: (query: string) => boolean) {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: matches(query) })) as typeof window.matchMedia
}
/** A laptop or desktop with a mouse: hover-capable, side-by-side layout. */
const desktopPointer = (query: string) => /hover: hover|min-width/.test(query)

describe('Gateway', () => {
  afterEach(() => {
    vi.useRealTimers()
    window.matchMedia = realMatchMedia
  })

  it('renders the portal identity and both systems', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('TAKSHAL CTRL')
    expect(screen.getByRole('heading', { level: 2, name: 'Avaria' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'המחלבה' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Avaria' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'המחלבה' })).toBeInTheDocument()
  })

  it('shows each system by its own supplied logo, with intrinsic size to avoid layout shift', () => {
    setup()
    for (const [name, system] of [
      ['Avaria', configured[0]],
      ['המחלבה', configured[1]],
    ] as const) {
      const logo = screen.getByRole('img', { name })
      expect(logo).toHaveAttribute('src', system.logo.src)
      expect(logo).toHaveAttribute('width', String(system.logo.width))
      expect(logo).toHaveAttribute('height', String(system.logo.height))
    }
  })

  it('carries no invented telemetry or status copy', () => {
    const { container } = setup()
    expect(container).not.toHaveTextContent(/NOMINAL|ONLINE|ACTIVE|DIAG|THRESHOLD|SYS·/i)
  })

  it('does not display destination URLs or routing details', () => {
    const { container } = setup()
    expect(container).not.toHaveTextContent(/ROUTE|example\.com|https?:/i)
  })

  it('links each entry to its configured destination, in DOM (tab) order', () => {
    setup()
    const links = screen.getAllByRole('link')
    expect(links).toEqual([avariaLink(), machlavaLink()])
    expect(avariaLink()).toHaveAttribute('href', 'https://avaria.example.com/')
    expect(machlavaLink()).toHaveAttribute('href', 'https://machlava.example.com/app')
    expect(avariaLink()).not.toHaveAttribute('target')
  })

  it('makes the focused world dominant and the other recede', () => {
    const { main } = setup()
    act(() => avariaLink().focus())
    expect(main).toHaveAttribute('data-active', 'avaria')
    expect(screen.getByRole('region', { name: 'Avaria' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('region', { name: 'המחלבה' })).toHaveAttribute('data-state', 'receded')

    act(() => machlavaLink().focus())
    expect(main).toHaveAttribute('data-active', 'machlava')

    act(() => machlavaLink().blur())
    expect(main).toHaveAttribute('data-active', 'none')
  })

  it('lets the most recent input lead: keyboard focus overrides a resting mouse, and vice versa', () => {
    mockMedia(desktopPointer)
    const { main } = setup()
    const machlava = region('המחלבה')

    fireEvent.pointerEnter(machlava, mouse)
    expect(main).toHaveAttribute('data-active', 'machlava')

    act(() => avariaLink().focus())
    expect(main).toHaveAttribute('data-active', 'avaria')

    fireEvent.pointerLeave(machlava, mouse)
    fireEvent.pointerEnter(machlava, mouse)
    expect(main).toHaveAttribute('data-active', 'machlava')

    fireEvent.pointerLeave(machlava, mouse)
    expect(main).toHaveAttribute('data-active', 'avaria')
  })

  it('never takes hover emphasis from touch', () => {
    mockMedia(desktopPointer)
    const { main } = setup()
    fireEvent.pointerEnter(region('Avaria'), { pointerType: 'touch' })
    expect(main).toHaveAttribute('data-active', 'none')
  })

  it('hands emphasis straight across when focus moves between the worlds', () => {
    const { main } = setup()
    act(() => avariaLink().focus())
    // From idle it is an ordinary lean-in, not a crossing.
    expect(main).not.toHaveAttribute('data-crossing')

    // Tab: the browser reports focus leaving one link and reaching the next as two separate
    // events, and React renders in between.
    act(() => {
      avariaLink().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: machlavaLink() }))
    })
    act(() => machlavaLink().focus())
    expect(main).toHaveAttribute('data-active', 'machlava')
    expect(main).toHaveAttribute('data-crossing', 'machlava')

    act(() => machlavaLink().blur())
    expect(main).toHaveAttribute('data-active', 'none')
    expect(main).not.toHaveAttribute('data-crossing')
  })

  it('crosses when the pointer moves straight from one world to the other, not after resting idle', () => {
    mockMedia(desktopPointer)
    const { main } = setup()
    const avaria = region('Avaria')
    const machlava = region('המחלבה')

    fireEvent.pointerEnter(avaria, mouse)
    expect(main).not.toHaveAttribute('data-crossing')

    // The browser reports leaving one world and entering the other as a single move.
    act(() => {
      fireEvent.pointerLeave(avaria, mouse)
      fireEvent.pointerEnter(machlava, mouse)
    })
    expect(main).toHaveAttribute('data-crossing', 'machlava')

    fireEvent.pointerLeave(machlava, mouse)
    expect(main).toHaveAttribute('data-active', 'none')
    fireEvent.pointerEnter(avaria, mouse)
    expect(main).toHaveAttribute('data-active', 'avaria')
    expect(main).not.toHaveAttribute('data-crossing')
  })

  it('runs the micro-parallax only for hover-capable desktops, never with reduced motion or touch', () => {
    expect(setup().main).not.toHaveAttribute('data-parallax')
    cleanup()

    mockMedia(desktopPointer)
    expect(setup().main).toHaveAttribute('data-parallax')
    cleanup()

    mockMedia((query) => desktopPointer(query) || query === '(prefers-reduced-motion: reduce)')
    expect(setup().main).not.toHaveAttribute('data-parallax')
  })

  it('eases the pointer position into the parallax depth, ignoring touch', async () => {
    mockMedia(desktopPointer)
    const { main } = setup()
    const px = () => Number(main.style.getPropertyValue('--px') || 0)
    const move = (pointerType: string) =>
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: window.innerWidth, clientY: window.innerHeight / 2, pointerType }),
      )

    move('touch')
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(px()).toBe(0)

    move('mouse')
    await vi.waitFor(() => expect(px()).toBeGreaterThan(0.5))
    expect(px()).toBeLessThanOrEqual(1)
  })

  it('plays the hand-off, then navigates in the same tab', () => {
    vi.useFakeTimers()
    const { navigate, main } = setup()

    fireEvent.click(machlavaLink())
    expect(main).toHaveAttribute('data-launching', 'machlava')
    expect(screen.getByRole('region', { name: 'המחלבה' })).toHaveAttribute('data-state', 'launching')
    // Announced through an <output> (implicit role="status") for assistive technology.
    expect(screen.getByText('מתחבר ל־המחלבה…').tagName).toBe('OUTPUT')
    expect(navigate).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(LAUNCH_DELAY_MS))
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://machlava.example.com/app')
  })

  it('starts navigating almost at once: the hand-off overlaps the page load instead of delaying it', () => {
    vi.useFakeTimers()
    const { navigate } = setup()
    fireEvent.click(avariaLink())
    act(() => vi.advanceTimersByTime(200))
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://avaria.example.com/')
  })

  it('ignores repeated activation while a hand-off is in flight', () => {
    vi.useFakeTimers()
    const { navigate } = setup()
    fireEvent.click(avariaLink())
    fireEvent.click(avariaLink())
    fireEvent.click(machlavaLink())
    act(() => vi.advanceTimersByTime(LAUNCH_DELAY_MS * 2))
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://avaria.example.com/')
  })

  it('leaves modified clicks to the browser (new tab / window)', () => {
    const { navigate, main } = setup()
    expect(clickAndCheckPrevented(avariaLink(), { metaKey: true })).toBe(false)
    expect(main).not.toHaveAttribute('data-launching')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('uses plain links with no hand-off when the user prefers reduced motion', () => {
    mockMedia((query) => query === '(prefers-reduced-motion: reduce)')
    const { navigate, main } = setup()
    expect(clickAndCheckPrevented(avariaLink(), { button: 0 })).toBe(false)
    expect(main).not.toHaveAttribute('data-launching')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows an unavailable entry instead of a broken link when a URL is missing or unsafe', () => {
    setup(createSystems({ avariaUrl: 'javascript:alert(1)', machlavaUrl: 'https://machlava.example.com/' }, BASE))
    expect(screen.queryByRole('link', { name: 'כניסה ל־Avaria' })).not.toBeInTheDocument()
    expect(screen.getByText('כתובת היעד טרם הוגדרה')).toBeInTheDocument()
    expect(machlavaLink()).toBeInTheDocument()
  })
})
