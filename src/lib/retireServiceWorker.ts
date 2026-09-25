/**
 * v0.2–v0.3 registered a Web Push service worker (`/sw.js`). The portal no longer has one, so
 * devices that installed it drop it on their next visit: unregistering also discards its push
 * subscription. No-op where nothing was ever registered.
 *
 * Transitional: safe to delete once those devices have had time to revisit the portal.
 */
export async function retireServiceWorkers(container: ServiceWorkerContainer | undefined = navigator.serviceWorker): Promise<void> {
  if (!container) return
  const registrations = await container.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))
}
