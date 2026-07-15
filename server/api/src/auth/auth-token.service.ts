import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, timingSafeEqual } from 'node:crypto'

export type AuthRole = 'customer' | 'operator' | 'rider'

export type AuthPrincipal = {
  subjectId: string
  role: AuthRole
  expiresAt: number
}

type TokenPayload = {
  sub: string
  role: AuthRole
  iat: number
  exp: number
}

@Injectable()
export class AuthTokenService {
  constructor(private readonly config: ConfigService) {}

  sign(subjectId: string, role: AuthRole) {
    const issuedAt = Math.floor(Date.now() / 1000)
    const roleKey = `${role.toUpperCase()}_AUTH_TOKEN_TTL_SECONDS`
    const ttl = Number(this.config.get<string>(roleKey) || this.config.get<string>('AUTH_TOKEN_TTL_SECONDS') || 604800)
    const header = this.encode({ alg: 'HS256', typ: 'JWT' })
    const payload = this.encode({ sub: subjectId, role, iat: issuedAt, exp: issuedAt + ttl })
    const signature = this.signature(`${header}.${payload}`)
    return `${header}.${payload}.${signature}`
  }

  verify(token: string): AuthPrincipal {
    const parts = token.split('.')
    if (parts.length !== 3) throw new UnauthorizedException('登录状态无效，请重新登录')
    const [header, payloadPart, signature] = parts
    const expected = this.signature(`${header}.${payloadPart}`)
    const actualBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expected)
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new UnauthorizedException('登录状态无效，请重新登录')
    }

    let payload: TokenPayload
    try {
      payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as TokenPayload
    } catch {
      throw new UnauthorizedException('登录状态无效，请重新登录')
    }
    if (!payload.sub || !['customer', 'operator', 'rider'].includes(payload.role) || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('登录已过期，请重新登录')
    }
    return { subjectId: payload.sub, role: payload.role, expiresAt: payload.exp }
  }

  private encode(value: object) {
    return Buffer.from(JSON.stringify(value)).toString('base64url')
  }

  private signature(value: string) {
    return createHmac('sha256', this.secret()).update(value).digest('base64url')
  }

  private secret() {
    const secret = this.config.get<string>('JWT_SECRET') || ''
    const isProduction = this.config.get<string>('NODE_ENV') === 'production'
    if (!secret || (isProduction && secret === 'change-me-in-production')) {
      throw new Error('JWT_SECRET must be configured for production')
    }
    return secret || 'city-flash-development-secret'
  }
}
