import { hubDeps } from '../../server/deps.js'
import { handleSubscribe } from '../../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleSubscribe(request, hubDeps())
}
