import { useEffect, useMemo } from 'react'
import type { SystemDefinition } from '../../config/systems'
import { resolveHandoff } from '../../shared/notifications/handoff'
import './handoff.css'

interface Props {
  readonly systems: readonly SystemDefinition[]
  readonly search?: string
  readonly navigate?: (url: string) => void
}

/**
 * `/open?app=…&target=…` — where notification clicks land. Validates the app and the relative
 * target, then continues to the destination built from the trusted configured base URL.
 */
export function OpenHandoff({ systems, search = window.location.search, navigate = (url) => window.location.replace(url) }: Props) {
  const resolution = useMemo(() => {
    const destinations = { avaria: null, machlava: null } as Record<'avaria' | 'machlava', string | null>
    for (const system of systems) destinations[system.id] = system.destination.ok ? system.destination.href : null
    return resolveHandoff(search, destinations)
  }, [systems, search])

  const system = resolution.kind === 'external' ? systems.find((item) => item.id === resolution.app) : undefined

  useEffect(() => {
    if (resolution.kind === 'external') navigate(resolution.url)
    else if (resolution.kind === 'portal') navigate('/')
  }, [resolution, navigate])

  return (
    <main className="handoff" dir="rtl">
      <p className="handoff__brand" dir="ltr">
        TAKSHAL <span aria-hidden="true">┃</span> CTRL
      </p>
      {resolution.kind === 'invalid' ? (
        <>
          <h1 className="handoff__title">לא ניתן לפתוח את הקישור</h1>
          <p className="handoff__text">הקישור בהתראה אינו תקין או שאינו מוכר.</p>
          <a className="handoff__link" href="/">
            חזרה ל־TAKSHAL CTRL
          </a>
        </>
      ) : (
        <h1 className="handoff__title">
          {system ? `מעביר ל${system.id === 'machlava' ? '' : '־'}${system.name}…` : 'פותח את TAKSHAL CTRL…'}
        </h1>
      )}
    </main>
  )
}
