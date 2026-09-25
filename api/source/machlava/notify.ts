import { hubDeps } from '../../../server/deps.js'
import { handleMachlavaNotify } from '../../../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleMachlavaNotify(request, hubDeps())
}
