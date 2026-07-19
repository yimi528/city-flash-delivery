import { UserRole } from '@prisma/client'
import { AuthService } from './auth.service'
import { generateTotpCode } from './totp'

const TOTP_SECRET = 'JBSWY3DPEHPK3PXP'
const STRONG_PASSWORD = 'DevOperator!2026'
const FIXED_TIME = 1_784_430_000_000

const baseConfig: Record<string, string> = {
  NODE_ENV: 'development',
  OPERATOR_BOOTSTRAP_ENABLED: 'true',
  OPERATOR_BOOTSTRAP_USERNAME: 'operator-demo',
  OPERATOR_BOOTSTRAP_PASSWORD: STRONG_PASSWORD,
  OPERATOR_BOOTSTRAP_TOTP_SECRET: TOTP_SECRET,
  OPERATOR_TOTP_ENCRYPTION_KEY: 'a-secure-random-key-for-encrypting-totp-secrets',
}

function createService() {
  const operator = {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  }
  const prisma = {
    operator,
    user: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), upsert: jest.fn() },
    userRoleAssignment: { upsert: jest.fn(), findMany: jest.fn() },
    riderProfile: { findUnique: jest.fn() },
    riderApplication: { findFirst: jest.fn() },
  }
  const config = { get: (key: string) => baseConfig[key] }
  const tokens = { sign: jest.fn(() => 'signed-operator-token') }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  const service = new AuthService(prisma as never, config as never, tokens as never, audit as never)
  return { service, operator, tokens, audit }
}

describe('AuthService operator password and TOTP login', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(FIXED_TIME))
  afterEach(() => jest.restoreAllMocks())

  function arrangeBootstrapOperator(operator: ReturnType<typeof createService>['operator']) {
    operator.findUnique.mockResolvedValue(null)
    operator.create.mockImplementation(({ data }) => Promise.resolve({
      ...data,
      id: 'operator-1',
      role: UserRole.OPERATOR,
      enabled: true,
      failedLoginCount: 0,
      lockedUntil: null,
      lastTotpCounter: null,
    }))
  }

  it('requires a correct password and current six-digit TOTP code', async () => {
    const { service, operator, tokens, audit } = createService()
    arrangeBootstrapOperator(operator)
    operator.updateMany.mockResolvedValue({ count: 1 })

    const result = await service.operatorLogin({
      username: 'operator-demo',
      password: STRONG_PASSWORD,
      totpCode: generateTotpCode(TOTP_SECRET, FIXED_TIME),
    })

    expect(result.token).toBe('signed-operator-token')
    expect(operator.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'operator-1' }),
      data: expect.objectContaining({ failedLoginCount: 0, lastTotpCounter: Math.floor(FIXED_TIME / 30_000) }),
    }))
    expect(tokens.sign).toHaveBeenCalledWith('operator-1', 'operator')
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'operator.login.succeeded' }))
  })

  it('rejects an incorrect dynamic code and counts the failure', async () => {
    const { service, operator, audit } = createService()
    arrangeBootstrapOperator(operator)
    operator.update.mockResolvedValue(undefined)

    await expect(service.operatorLogin({
      username: 'operator-demo',
      password: STRONG_PASSWORD,
      totpCode: '000000',
    })).rejects.toThrow('账号、密码或动态验证码错误')

    expect(operator.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ failedLoginCount: 1 }),
    }))
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'operator.login.failed' }))
  })

  it('rejects a TOTP counter that has already been used', async () => {
    const { service, operator, audit } = createService()
    arrangeBootstrapOperator(operator)
    operator.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.operatorLogin({
      username: 'operator-demo',
      password: STRONG_PASSWORD,
      totpCode: generateTotpCode(TOTP_SECRET, FIXED_TIME),
    })).rejects.toThrow('动态验证码已使用')

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'operator.login.totp-replayed' }))
  })
})
