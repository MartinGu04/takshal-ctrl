/** Minimal, strict JSON-over-HTTP helpers for the hub's Web-standard (Request → Response) handlers. */

export const MAX_BODY_BYTES = 8 * 1024

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } })
}

export const errors = {
  badRequest: (error: string) => json(400, { error }),
  unauthorized: () => json(401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' }),
  forbidden: (error = 'forbidden') => json(403, { error }),
  notFound: () => json(404, { error: 'not-found' }),
  methodNotAllowed: (allow: string) => json(405, { error: 'method-not-allowed' }, { allow }),
  unsupportedMediaType: () => json(415, { error: 'unsupported-media-type' }),
  tooLarge: () => json(413, { error: 'payload-too-large' }),
  tooManyRequests: (retryAfterSeconds: number) =>
    json(429, { error: 'rate-limited', retryAfter: retryAfterSeconds }, { 'retry-after': String(retryAfterSeconds) }),
  unavailable: () => json(503, { error: 'not-configured' }),
  internal: () => json(500, { error: 'internal' }),
}

export class HttpError extends Error {
  readonly response: Response
  constructor(response: Response) {
    super(`HTTP ${response.status}`)
    this.response = response
  }
}

/**
 * Reads a JSON object body. Requires `application/json` (which also forces a CORS preflight for
 * cross-origin callers, which the hub never answers) and caps the size.
 */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? ''
  if (!/^application\/json\b/i.test(type)) throw new HttpError(errors.unsupportedMediaType())

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) throw new HttpError(errors.tooLarge())

  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new HttpError(errors.tooLarge())

  let value: unknown
  try {
    value = text ? JSON.parse(text) : {}
  } catch {
    throw new HttpError(errors.badRequest('invalid-json'))
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpError(errors.badRequest('invalid-body'))
  return value as Record<string, unknown>
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  const match = header?.match(/^Bearer\s+([A-Za-z0-9._~+/=-]+)$/)
  return match?.[1] ?? null
}
