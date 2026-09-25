import { hubDeps } from '../../server/deps.js'
import { handleUnsubscribe } from '../../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleUnsubscribe(request, hubDeps())
}
