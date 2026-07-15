import { randomUUID } from 'node:crypto'

type RequestLike = { header(name: string): string | undefined }
type ResponseLike = { setHeader(name: string, value: string): void; locals: Record<string, unknown> }
type NextFunction = () => void

export function requestIdMiddleware(request: RequestLike, response: ResponseLike, next: NextFunction) {
  const header = request.header('x-request-id')
  const requestId = header && header.length <= 128 ? header : randomUUID()
  response.setHeader('x-request-id', requestId)
  response.locals.requestId = requestId
  next()
}
