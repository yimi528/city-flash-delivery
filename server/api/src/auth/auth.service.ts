import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../common/prisma/prisma.service'
import { UserRole, RoleStatus } from '@prisma/client'
import { AuthTokenService } from './auth-token.service'
import { ChangePasswordDto, OperatorLoginDto, WechatLoginDto } from './auth.dto'
import { AuditService } from '../audit/audit.service'

type CodeSessionResponse = {
  openid?: string
  session_key?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokens: AuthTokenService,
    private readonly audit: AuditService,
  ) {}

  async wechatLogin(dto: WechatLoginDto) {
    const mockEnabled = this.isDevelopmentMockEnabled('WECHAT_LOGIN_MOCK_ENABLED')
    let openid = ''
    let unionid = ''
    let mode: 'wechat' | 'mock' = 'wechat'

    if (mockEnabled) {
      openid = 'mock-openid-demo-user'
      mode = 'mock'
    } else {
      if (!dto.code) throw new UnauthorizedException('微信登录凭证不能为空')
      const identity = await this.exchangeWechatCode(dto.code)
      openid = identity.openid
      unionid = identity.unionid
    }

    const user = mode === 'mock'
      ? await this.prisma.user.upsert({
          where: { id: 'demo-user' },
          update: {
            openid,
            nickname: dto.nickname || '微信用户',
            avatarUrl: dto.avatarUrl || '',
          },
          create: {
            id: 'demo-user',
            openid,
            nickname: dto.nickname || '微信用户',
            avatarUrl: dto.avatarUrl || '',
            memberLevel: '青铜会员',
          },
        })
      : await this.upsertWechatUser({ openid, unionid, nickname: dto.nickname, avatarUrl: dto.avatarUrl })

    await this.ensureRoleAssignment(user.id, UserRole.CUSTOMER)

    const roleSnapshot = await this.accountRoles(user.id)
    return {
      token: this.tokens.sign(user.id, 'customer'),
      role: 'customer',
      mode,
      ...roleSnapshot,
      user: {
        id: user.id,
        phone: user.phone || '',
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        memberLevel: user.memberLevel,
      },
    }
  }

  async operatorLogin(dto: OperatorLoginDto) {
    const operator = await this.findOrBootstrapOperator(dto.username, dto.password)
    if (operator?.lockedUntil && operator.lockedUntil > new Date()) {
      await this.audit.record({ action: 'operator.login.locked', resourceType: 'operator', resourceId: operator.id, metadata: { username: dto.username } })
      throw new UnauthorizedException('账号暂时锁定，请稍后再试')
    }
    if (!operator) return this.recordFailedOperatorLogin(null, dto.username)
    if (!operator.enabled || !this.verifyPassword(dto.password, operator.passwordHash)) {
      return this.recordFailedOperatorLogin(operator, dto.username)
    }
    await this.prisma.operator.update({
      where: { id: operator.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    })
    await this.audit.record({ action: 'operator.login.succeeded', actorId: operator.id, actorRole: 'operator', resourceType: 'operator', resourceId: operator.id })
    return {
      token: this.tokens.sign(operator.id, 'operator'),
      role: 'operator',
      operator: {
        id: operator.id,
        username: operator.username,
        name: operator.name,
        role: operator.role,
      },
    }
  }

  async changeOperatorPassword(operatorId: string, dto: ChangePasswordDto) {
    const operator = await this.prisma.operator.findUnique({ where: { id: operatorId } })
    if (!operator || !this.verifyPassword(dto.currentPassword, operator.passwordHash)) {
      await this.audit.record({ action: 'operator.password.change.failed', actorId: operatorId, actorRole: 'operator', resourceType: 'operator', resourceId: operatorId })
      throw new UnauthorizedException('当前密码错误')
    }
    if (dto.currentPassword === dto.newPassword) throw new UnauthorizedException('新密码不能与当前密码相同')
    await this.prisma.operator.update({ where: { id: operatorId }, data: { passwordHash: this.hashPassword(dto.newPassword), failedLoginCount: 0, lockedUntil: null } })
    await this.audit.record({ action: 'operator.password.changed', actorId: operatorId, actorRole: 'operator', resourceType: 'operator', resourceId: operatorId })
    return { success: true }
  }

  async accountRoles(userId: string) {
    const [user, roles, rider, application] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { preferredRole: true } }),
      this.prisma.userRoleAssignment.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.riderProfile.findUnique({ where: { userId }, select: { id: true, status: true, roleStatus: true, workStatus: true, name: true, vehicleName: true } }),
      this.prisma.riderApplication.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ])
    return {
      roles: roles.map((role) => ({ role: role.role.toLowerCase(), status: role.status.toLowerCase() })),
      availableRoles: roles.filter((role) => role.status === RoleStatus.ACTIVE).map((role) => role.role.toLowerCase()),
      currentRole: user?.preferredRole === UserRole.RIDER && roles.some((role) => role.role === UserRole.RIDER && role.status === RoleStatus.ACTIVE) ? 'rider' : 'customer',
      rider: rider ? { ...rider, roleStatus: rider.roleStatus.toLowerCase(), workStatus: rider.workStatus.toLowerCase() } : null,
      application: application ? {
        id: application.id,
        status: application.status.toLowerCase(),
        realName: application.realName,
        vehicleName: application.vehicleName,
        submittedAt: application.submittedAt,
        reviewedAt: application.reviewedAt,
        rejectionReason: application.rejectionReason,
      } : null,
    }
  }

  async switchRole(userId: string, role: 'customer' | 'rider') {
    if (role === 'customer') {
      await this.prisma.user.update({ where: { id: userId }, data: { preferredRole: UserRole.CUSTOMER } })
      return { token: this.tokens.sign(userId, 'customer'), currentRole: 'customer' }
    }
    const assignment = await this.prisma.userRoleAssignment.findUnique({ where: { userId_role: { userId, role: UserRole.RIDER } } })
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId } })
    if (!assignment || assignment.status !== RoleStatus.ACTIVE || !rider || rider.roleStatus !== RoleStatus.ACTIVE) {
      throw new ForbiddenException('当前骑手身份不可用')
    }
    await this.prisma.user.update({ where: { id: userId }, data: { preferredRole: UserRole.RIDER } })
    return { token: this.tokens.sign(rider.id, 'rider'), currentRole: 'rider', rider }
  }

  private async ensureRoleAssignment(userId: string, role: UserRole, status: RoleStatus = RoleStatus.ACTIVE) {
    return this.prisma.userRoleAssignment.upsert({
      where: { userId_role: { userId, role } },
      update: { status },
      create: { userId, role, status },
    })
  }

  private async exchangeWechatCode(
    code: string,
    appIdKey = 'WECHAT_MINI_APP_ID',
    appSecretKey = 'WECHAT_MINI_APP_SECRET',
  ): Promise<{ openid: string; unionid: string }> {
    if (!code) throw new UnauthorizedException('微信登录凭证不能为空')
    const appId = this.config.get<string>(appIdKey) || ''
    const appSecret = this.config.get<string>(appSecretKey) || ''
    if (!appId || !appSecret) throw new UnauthorizedException('服务端尚未配置微信小程序登录凭证')
    const query = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    })
    let response: Response
    try {
      response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`)
    } catch {
      throw new BadGatewayException('微信登录服务暂时不可用')
    }
    const data = (await response.json()) as CodeSessionResponse
    if (!response.ok || !data.openid || data.errcode) {
      throw new UnauthorizedException(data.errmsg || '微信登录凭证校验失败')
    }
    return { openid: data.openid, unionid: data.unionid || '' }
  }

  private async upsertWechatUser(input: { openid: string; unionid: string; nickname?: string; avatarUrl?: string }) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { openid: input.openid },
          ...(input.unionid ? [{ unionid: input.unionid }] : []),
        ],
      },
    })
    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          openid: input.openid,
          unionid: input.unionid || existing.unionid,
          nickname: input.nickname || undefined,
          avatarUrl: input.avatarUrl || undefined,
        },
      })
    }
    return this.prisma.user.create({
      data: {
        openid: input.openid,
        unionid: input.unionid || null,
        nickname: input.nickname || '微信用户',
        avatarUrl: input.avatarUrl || '',
        memberLevel: '青铜会员',
      },
    })
  }

  private async findOrBootstrapOperator(username: string, password: string) {
    const existing = await this.prisma.operator.findUnique({ where: { username } })
    const bootstrapUsername = this.config.get<string>('OPERATOR_BOOTSTRAP_USERNAME') || 'operator-demo'
    const bootstrapPassword = this.config.get<string>('OPERATOR_BOOTSTRAP_PASSWORD') || ''
    const bootstrapEnabled = this.isDevelopmentMockEnabled('OPERATOR_BOOTSTRAP_ENABLED')
    if (existing) {
      if (bootstrapEnabled && username === bootstrapUsername && password === bootstrapPassword && !existing.passwordHash) {
        return this.prisma.operator.update({
          where: { id: existing.id },
          data: {
            passwordHash: this.hashPassword(password),
            failedLoginCount: 0,
            lockedUntil: null,
          },
        })
      }
      return existing
    }
    if (!bootstrapEnabled) return null
    if (username !== bootstrapUsername || password !== bootstrapPassword) return null
    return this.prisma.operator.create({
      data: {
        username,
        name: this.config.get<string>('OPERATOR_BOOTSTRAP_NAME') || '同城速送运营员',
        passwordHash: this.hashPassword(password),
      },
    })
  }

  private async recordFailedOperatorLogin(
    operator: { id: string; failedLoginCount: number } | null,
    username: string,
  ): Promise<never> {
    if (operator) {
      const failedLoginCount = operator.failedLoginCount + 1
      await this.prisma.operator.update({
        where: { id: operator.id },
        data: { failedLoginCount, lockedUntil: failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null },
      })
    }
    await this.audit.record({ action: 'operator.login.failed', resourceType: 'operator', resourceId: operator?.id, metadata: { username } })
    throw new UnauthorizedException('账号或密码错误')
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex')
    const digest = scryptSync(password, salt, 64).toString('hex')
    return `scrypt$${salt}$${digest}`
  }

  private verifyPassword(password: string, encoded: string) {
    const [algorithm, salt, digest] = encoded.split('$')
    if (algorithm !== 'scrypt' || !salt || !digest) return false
    const actual = scryptSync(password, salt, 64)
    const expected = Buffer.from(digest, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }

  private isDevelopmentMockEnabled(key: string) {
    return this.config.get<string>('NODE_ENV') !== 'production' && this.config.get<string>(key) === 'true'
  }

}
