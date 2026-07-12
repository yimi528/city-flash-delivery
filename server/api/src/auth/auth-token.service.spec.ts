import { UnauthorizedException } from '@nestjs/common'
import { AuthTokenService } from './auth-token.service'

function tokenService(overrides: Record<string, string> = {}) {
  const values = {
    JWT_SECRET: 'test-secret-with-enough-entropy',
    AUTH_TOKEN_TTL_SECONDS: '3600',
    NODE_ENV: 'test',
    ...overrides,
  }
  return new AuthTokenService({ get: (key: string) => values[key as keyof typeof values] } as never)
}

describe('AuthTokenService', () => {
  it('signs and verifies customer tokens', () => {
    const service = tokenService()
    const token = service.sign('user-1', 'customer')

    expect(service.verify(token)).toEqual(expect.objectContaining({ subjectId: 'user-1', role: 'customer' }))
  })

  it('rejects tampered tokens', () => {
    const service = tokenService()
    const token = service.sign('operator-1', 'operator')
    const tampered = `${token.slice(0, -1)}x`

    expect(() => service.verify(tampered)).toThrow(UnauthorizedException)
  })

  it('rejects expired tokens', () => {
    const service = tokenService({ AUTH_TOKEN_TTL_SECONDS: '-1' })
    const token = service.sign('user-1', 'customer')

    expect(() => service.verify(token)).toThrow('登录已过期')
  })
})
