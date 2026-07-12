import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthPrincipal, AuthRole, AuthTokenService } from './auth-token.service'

export type AuthenticatedRequest = {
  headers: { authorization?: string }
  auth: AuthPrincipal
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: AuthTokenService,
    private readonly allowedRoles: AuthRole[] = [],
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const authorization = request.headers.authorization || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!token) throw new UnauthorizedException('请先登录')
    const auth = this.tokens.verify(token)
    if (this.allowedRoles.length && !this.allowedRoles.includes(auth.role)) {
      throw new ForbiddenException('当前账号无权执行该操作')
    }
    request.auth = auth
    return true
  }
}

@Injectable()
export class CustomerAuthGuard extends AuthGuard {
  constructor(tokens: AuthTokenService) {
    super(tokens, ['customer'])
  }
}

@Injectable()
export class OperatorAuthGuard extends AuthGuard {
  constructor(tokens: AuthTokenService) {
    super(tokens, ['operator'])
  }
}

@Injectable()
export class RiderAuthGuard extends AuthGuard {
  constructor(tokens: AuthTokenService) {
    super(tokens, ['rider'])
  }
}
