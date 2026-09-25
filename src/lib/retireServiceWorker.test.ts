import { describe, expect, it, vi } from 'vitest'
import { retireServiceWorkers } from './retireServiceWorker'

describe('retireServiceWorkers', () => {
  it('unregisters every leftover service worker registration', async () => {
    const unregister = vi.fn(async () => true)
    const container = { getRegistrations: vi.fn(async () => [{ unregister }, { unregister }]) }

    await retireServiceWorkers(container as unknown as ServiceWorkerContainer)

    expect(unregister).toHaveBeenCalledTimes(2)
  })

  it('does nothing where service workers are unsupported', async () => {
    await expect(retireServiceWorkers(undefined)).resolves.toBeUndefined()
  })
})
