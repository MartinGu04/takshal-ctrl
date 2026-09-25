import { hubDeps } from '../../server/deps.js'
import { handleRotate } from '../../server/handlers.js'

export function POST(request: Request): Promise<Response> {
  return handleRotate(request, hubDeps())
}
