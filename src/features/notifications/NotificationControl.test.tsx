import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationControl } from './NotificationControl'
import { createFakes, fakeController, fakeSubscription } from './testing'

describe('NotificationControl', () => {
  it('renders a small labelled trigger and does nothing until opened', async () => {
    const fakes = createFakes()
    render(<NotificationControl controller={fakeController(fakes)} />)
    const trigger = screen.getByRole('button', { name: 'התראות' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fakes.calls).toEqual([])
  })

  it('walks sign-in → enable → test → disable', async () => {
    const user = userEvent.setup()
    const fakes = createFakes({ session: null })
    render(<NotificationControl controller={fakeController(fakes)} />)

    await user.click(screen.getByRole('button', { name: 'התראות' }))
    expect(await screen.findByRole('dialog', { name: 'התראות' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'התחברות עם Google' }))
    expect(fakes.calls).toContain('signIn')

    // Back from Google with a session.
    fakes.session = { accessToken: 'token', email: 'user@example.com' }
    await user.click(screen.getByRole('button', { name: 'התראות' }))
    await user.click(screen.getByRole('button', { name: 'התראות' }))
    await user.click(await screen.findByRole('button', { name: 'הפעלת התראות במכשיר זה' }))
    expect(await screen.findByText('ההתראות פעילות במכשיר זה.')).toBeInTheDocument()
    expect(screen.getByText('user@example.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'שליחת התראת בדיקה' }))
    expect(await screen.findByText('התראת בדיקה נשלחה.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'כיבוי במכשיר זה' }))
    expect(await screen.findByText('ההתראות כובו במכשיר זה.')).toBeInTheDocument()
  })

  it('explains Home Screen installation on iPhone/iPad', async () => {
    const user = userEvent.setup()
    render(<NotificationControl controller={fakeController(createFakes({ support: 'install-required' }))} />)
    await user.click(screen.getByRole('button', { name: 'התראות' }))
    expect(await screen.findByText(/להוסיף את TAKSHAL CTRL למסך הבית/)).toBeInTheDocument()
    expect(screen.getByText('הוספה למסך הבית')).toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<NotificationControl controller={fakeController(createFakes())} />)
    const trigger = screen.getByRole('button', { name: 'התראות' })
    await user.click(trigger)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('shows the enabled dot from a local-only check', async () => {
    const fakes = createFakes({ permission: 'granted', subscription: fakeSubscription() })
    render(<NotificationControl controller={fakeController(fakes)} />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'התראות (פעילות)' })).toHaveAttribute('data-enabled', 'true')
  })
})
