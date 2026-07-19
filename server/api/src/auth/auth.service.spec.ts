import { UserRole } from '@prisma/client'
import { scryptSync } from 'node:crypto'
import { AuthService } from './auth.service'

const STRONG_PASSWORD = 'DevOperator!2026'

function passwordHash(password: string) {
  const salt = '0123456789abcdef0123456789abcdef'
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`
}

function createService() {
  const operator = {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  }
  const prisma = {
    operator,
    user: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), upsert: jest.fn() },
    userRoleAssignment: { upsert: jest.fn(), findMany: jest.fn() },
    riderProfile: { findUnique: jest.fn() },
    riderApplication: { findFirst: jest.fn() },
  }
  const values: Record<string, string> = { NODE_ENV: 'production' }
  const config = { get: (key: string) => values[key] }
  const tokens = { sign: jest.fn(() => 'signed-operator-token') }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  const service = new AuthService(prisma as never, config as never, tokens as never, audit as never)
  return { service, operator, tokens, audit }
}

function enabledOperator(overrides: Record<string, unknown> = {}) {
  return {
    id: 'operator-1',
    username: 'operator-demo',
    name: '同城速送运营员',
    role: UserRole.OPERATOR,
    enabled: true,
    failedLoginCount: 0,
    lockedUntil: null,
    passwordHash: passwordHash(STRONG_PASSWORD),
    ...overrides,
  }
}

describe('AuthService operator password login', () => {
  afterEach(() => jest.restoreAllMocks())

  it('issues an operator session for the correct username and strong password', async () => {
    const { service, operator, tokens, audit } = createService()
    operator.findUnique.mockResolvedValue(enabledOperator())
    operator.update.mockResolvedValue(undefined)

    const result = await service.operatorLogin({ username: 'operator-demo', password: STRONG_PASSWORD })

    expect(result.token).toBe('signed-operator-token')
    expect(operator.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'operator-1' },
      data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }),
    }))
    expect(tokens.sign).toHaveBeenCalledWith('operator-1', 'operator')
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'operator.login.succeeded' }))
  })

  it('rejects an incorrect password and counts the failure', async () => {
    const { service, operator, audit } = createService()
    operator.findUnique.mockResolvedValue(enabledOperator({ failedLoginCount: 2 }))
    operator.update.mockResolvedValue(undefined)

    await expect(service.operatorLogin({
      username: 'operator-demo',
      password: 'WrongPassword!2026',
    })).rejects.toThrow('账号或密码错误')

    expect(operator.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ failedLoginCount: 3 }),
    }))
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'operator.login.failed' }))
  })

  it('rejects an operator account while its lock is active', async () => {
    const { service, operator, audit } = createService()
    operator.findUnique.mockResolvedValue(enabledOperator({ lockedUntil: new Date(Date.now() + 60_000) }))

    await expect(service.operatorLogin({
      username: 'operator-demo',
      password: STRONG_PASSWORD,
    })).rejects.toThrow('账号暂时锁定')

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'operator.login.locked' }))
  })
})
