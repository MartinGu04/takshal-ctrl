/** Client for the TAKSHAL CTRL Notification Hub API (same origin, bearer-authenticated). */

export type HubResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly error: string; readonly retryAfter?: number }

export interface HubApi {
  subscribe(token: string, subscription: PushSubscriptionJSON, deviceLabel: string | null): Promise<HubResult<{ subscription: { id: string } }>>
  unsubscribe(token: string, endpoint: string): Promise<HubResult<{ removed: boolean }>>
  status(token: string, endpoint: string | null): Promise<HubResult<{ registered: boolean; devices: number }>>
  test(token: string, endpoint: string | null): Promise<HubResult<{ delivered: number; failed: number; removed: number }>>
}

async function post<T>(path: string, token: string, body: unknown): Promise<HubResult<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    return { ok: false, status: 0, error: 'network' }
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (response.ok) return { ok: true, data: data as T }
  return {
    ok: false,
    status: response.status,
    error: typeof data.error === 'string' ? data.error : 'error',
    ...(typeof data.retryAfter === 'number' ? { retryAfter: data.retryAfter } : {}),
  }
}

export const hubApi: HubApi = {
  subscribe: (token, subscription, deviceLabel) => post('/api/push/subscribe', token, { subscription, deviceLabel }),
  unsubscribe: (token, endpoint) => post('/api/push/unsubscribe', token, { endpoint }),
  status: (token, endpoint) => post('/api/push/status', token, endpoint ? { endpoint } : {}),
  test: (token, endpoint) => post('/api/push/test', token, endpoint ? { endpoint } : {}),
}
