import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { AuthPrincipal } from './auth-token.service'
import { AuthenticatedRequest } from './auth.guard'

export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext): AuthPrincipal => {
  return context.switchToHttp().getRequest<AuthenticatedRequest>().auth
})
