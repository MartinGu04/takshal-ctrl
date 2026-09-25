import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { clearAuthReturn, isAuthReturn } from './auth'
import type { NotificationController, NotificationSnapshot, NotificationStatus } from './controller'
import { createNotificationController } from './createController'
import './notifications.css'

const STATUS_TEXT: Record<NotificationStatus, string> = {
  checking: 'בודק את מצב ההתראות…',
  'not-configured': 'ההתראות עדיין לא הוגדרו בשרת של TAKSHAL CTRL.',
  unsupported: 'הדפדפן או המכשיר הזה אינם תומכים בהתראות Push.',
  'install-required': 'כדי לקבל התראות באייפון או באייפד, יש להוסיף את TAKSHAL CTRL למסך הבית ולפתוח אותו משם.',
  'signed-out': 'התחברות עם Google מחברת את המכשיר הזה להתראות של Avaria והמחלבה.',
  ready: 'המכשיר מוכן. ההרשאה תתבקש רק לאחר לחיצה.',
  requesting: 'ממתין לאישור ההרשאה…',
  enabled: 'ההתראות פעילות במכשיר זה.',
  denied: 'ההרשאה להתראות נחסמה. ניתן לאפשר אותה מחדש בהגדרות הדפדפן או המכשיר.',
  error: 'משהו השתבש. אפשר לנסות שוב.',
}

const FEEDBACK_TEXT = {
  'test-sent': 'התראת בדיקה נשלחה.',
  'test-rate-limited': 'נשלחו יותר מדי התראות בדיקה. נסו שוב בעוד מספר דקות.',
  'test-failed': 'שליחת התראת הבדיקה נכשלה.',
  disabled: 'ההתראות כובו במכשיר זה.',
} as const

const TONE: Record<NotificationStatus, 'neutral' | 'ok' | 'warn' | 'off'> = {
  checking: 'neutral',
  'not-configured': 'off',
  unsupported: 'off',
  'install-required': 'warn',
  'signed-out': 'neutral',
  ready: 'neutral',
  requesting: 'neutral',
  enabled: 'ok',
  denied: 'warn',
  error: 'warn',
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="ntf__google">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5Z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44Z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5Z" />
    </svg>
  )
}

interface Props {
  /** Injectable for tests; defaults to the production controller. */
  readonly controller?: NotificationController
}

export function NotificationControl({ controller: injected }: Props) {
  const [controller] = useState(() => injected ?? createNotificationController())
  const snapshot = useSyncExternalStore(
    useCallback((listener) => controller.subscribe(listener), [controller]),
    () => controller.state,
  )
  // Returning from Google sign-in reopens the panel where the user left off.
  const [open, setOpen] = useState(isAuthReturn)
  const [localEnabled, setLocalEnabled] = useState(false)
  const panelId = useId()
  const titleId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDialogElement>(null)

  // Local-only check for the "enabled" dot — no auth client or network for anonymous visitors.
  useEffect(() => {
    void controller.hasLocalSubscription().then(setLocalEnabled)
  }, [controller])

  useEffect(() => {
    if (isAuthReturn()) void controller.refresh().finally(clearAuthReturn)
  }, [controller])

  useEffect(() => {
    if (!open) return
    void controller.refresh()
    const stopWatching = controller.watchAuth()
    panelRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      stopWatching()
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, controller])

  const enabled = snapshot.status === 'enabled' || (snapshot.status === 'checking' && localEnabled)

  return (
    <div className="ntf" dir="rtl">
      <button
        ref={buttonRef}
        type="button"
        className="ntf__trigger"
        data-enabled={enabled || undefined}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={enabled ? 'התראות (פעילות)' : 'התראות'}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        <span className="ntf__dot" aria-hidden="true" />
      </button>

      {open && (
        <dialog ref={panelRef} id={panelId} className="ntf__panel" open aria-labelledby={titleId} tabIndex={-1}>
          <div className="ntf__head">
            <h2 id={titleId} className="ntf__title">
              התראות
            </h2>
            <button
              type="button"
              className="ntf__close"
              aria-label="סגירה"
              onClick={() => {
                setOpen(false)
                buttonRef.current?.focus()
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <p className="ntf__sources" dir="ltr">
            Avaria · המחלבה
          </p>

          <Panel snapshot={snapshot} controller={controller} />
        </dialog>
      )}
    </div>
  )
}

function Panel({ snapshot, controller }: { snapshot: NotificationSnapshot; controller: NotificationController }) {
  const { status, busy, feedback, email } = snapshot

  return (
    <>
      <output className="ntf__status" data-tone={TONE[status]} aria-live="polite">
        <span className="ntf__status-dot" aria-hidden="true" />
        {STATUS_TEXT[status]}
      </output>

      {status === 'install-required' && (
        <ol className="ntf__steps">
          <li>
            פתחו את TAKSHAL CTRL ב־Safari ולחצו על <strong>שיתוף</strong>.
          </li>
          <li>
            בחרו <strong>הוספה למסך הבית</strong>.
          </li>
          <li>פתחו את TAKSHAL CTRL ממסך הבית והפעילו כאן את ההתראות.</li>
        </ol>
      )}

      <div className="ntf__actions">
        {status === 'signed-out' && (
          <button type="button" className="ntf__primary" disabled={busy} onClick={() => void controller.signIn()}>
            <GoogleMark />
            התחברות עם Google
          </button>
        )}
        {(status === 'ready' || status === 'requesting') && (
          <button type="button" className="ntf__primary" disabled={busy} onClick={() => void controller.enable()}>
            הפעלת התראות במכשיר זה
          </button>
        )}
        {status === 'enabled' && (
          <>
            <button type="button" className="ntf__primary" disabled={busy} onClick={() => void controller.sendTest()}>
              שליחת התראת בדיקה
            </button>
            <button type="button" className="ntf__secondary" disabled={busy} onClick={() => void controller.disable()}>
              כיבוי במכשיר זה
            </button>
          </>
        )}
        {status === 'error' && (
          <button type="button" className="ntf__secondary" disabled={busy} onClick={() => void controller.refresh()}>
            ניסיון נוסף
          </button>
        )}
      </div>

      {feedback && (
        <output className="ntf__feedback" data-kind={feedback}>
          {FEEDBACK_TEXT[feedback]}
        </output>
      )}

      {email && (status === 'ready' || status === 'enabled' || status === 'requesting') && (
        <div className="ntf__account">
          <span className="ntf__email" dir="ltr">
            {email}
          </span>
          <button type="button" className="ntf__link" disabled={busy} onClick={() => void controller.signOut()}>
            התנתקות
          </button>
        </div>
      )}
    </>
  )
}
