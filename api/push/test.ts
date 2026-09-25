import { hubDeps } from '../../server/deps.js'
import { handleTest } from '../../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleTest(request, hubDeps())
}
