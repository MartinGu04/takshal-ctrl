import { act, fireEvent, render, screen } from '@testing-library/react'
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

describe('Gateway', () => {
  afterEach(() => vi.useRealTimers())

  it('renders the portal identity and both systems', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('TAKSHAL CTRL')
    expect(screen.getByRole('heading', { level: 2, name: 'AVARIA' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'המחלבה' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'AVARIA' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'המחלבה' })).toBeInTheDocument()
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
    expect(screen.getByRole('region', { name: 'AVARIA' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('region', { name: 'המחלבה' })).toHaveAttribute('data-state', 'receded')

    act(() => machlavaLink().focus())
    expect(main).toHaveAttribute('data-active', 'machlava')

    act(() => machlavaLink().blur())
    expect(main).toHaveAttribute('data-active', 'none')
  })

  it('plays the hand-off, then navigates in the same tab', () => {
    vi.useFakeTimers()
    const { navigate, main } = setup()

    fireEvent.click(machlavaLink())
    expect(main).toHaveAttribute('data-launching', 'machlava')
    expect(screen.getByRole('region', { name: 'המחלבה' })).toHaveAttribute('data-state', 'launching')
    expect(screen.getByText('CONNECTING')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(LAUNCH_DELAY_MS))
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://machlava.example.com/app')
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
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: query === '(prefers-reduced-motion: reduce)',
    })) as typeof window.matchMedia
    try {
      const { navigate, main } = setup()
      expect(clickAndCheckPrevented(avariaLink(), { button: 0 })).toBe(false)
      expect(main).not.toHaveAttribute('data-launching')
      expect(navigate).not.toHaveBeenCalled()
    } finally {
      window.matchMedia = original
    }
  })

  it('shows an unavailable entry instead of a broken link when a URL is missing or unsafe', () => {
    setup(createSystems({ avariaUrl: 'javascript:alert(1)', machlavaUrl: 'https://machlava.example.com/' }, BASE))
    expect(screen.queryByRole('link', { name: 'כניסה ל־Avaria' })).not.toBeInTheDocument()
    expect(screen.getByText('כתובת היעד טרם הוגדרה')).toBeInTheDocument()
    expect(screen.getByText('NO ROUTE')).toBeInTheDocument()
    expect(machlavaLink()).toBeInTheDocument()
  })
})
