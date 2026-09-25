import { hubDeps } from '../../server/deps.js'
import { handleStatus } from '../../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleStatus(request, hubDeps())
}
