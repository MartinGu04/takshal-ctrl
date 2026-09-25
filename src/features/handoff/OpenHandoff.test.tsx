import { render, screen } from '@testing-library/react'
import { createSystems } from '../../config/systems'
import { OpenHandoff } from './OpenHandoff'

const systems = createSystems({ avariaUrl: 'https://takalot.vercel.app/', machlavaUrl: 'https://luzly.vercel.app/' }, 'https://ctrl.example/')

describe('/open hand-off', () => {
  it('continues to the destination built from the configured base', () => {
    const navigate = vi.fn()
    render(<OpenHandoff systems={systems} search="?app=avaria&target=%2Fincident%2F123" navigate={navigate} />)
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://takalot.vercel.app/incident/123')
    expect(screen.getByRole('heading')).toHaveTextContent('מעביר ל־Avaria…')
  })

  it('opens המחלבה', () => {
    const navigate = vi.fn()
    render(<OpenHandoff systems={systems} search="?app=machlava" navigate={navigate} />)
    expect(navigate).toHaveBeenCalledWith('https://luzly.vercel.app/')
    expect(screen.getByRole('heading')).toHaveTextContent('מעביר להמחלבה…')
  })

  it.each(['?app=avaria&target=https%3A%2F%2Fevil.example', '?app=avaria&target=%2F%2Fevil.example', '?app=evil&target=%2Fx'])(
    'refuses malicious link %s without navigating',
    (search) => {
      const navigate = vi.fn()
      render(<OpenHandoff systems={systems} search={search} navigate={navigate} />)
      expect(navigate).not.toHaveBeenCalled()
      expect(screen.getByRole('heading')).toHaveTextContent('לא ניתן לפתוח את הקישור')
      expect(screen.getByRole('link', { name: 'חזרה ל־TAKSHAL CTRL' })).toHaveAttribute('href', '/')
    },
  )

  it('sends portal links home', () => {
    const navigate = vi.fn()
    render(<OpenHandoff systems={systems} search="" navigate={navigate} />)
    expect(navigate).toHaveBeenCalledWith('/')
  })
})
