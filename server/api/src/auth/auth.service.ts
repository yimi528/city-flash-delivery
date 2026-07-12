import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../common/prisma/prisma.service'
import { AuthTokenService } from './auth-token.service'
import { OperatorLoginDto, WechatLoginDto } from './auth.dto'

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
  ) {}

  async wechatLogin(dto: WechatLoginDto) {
    const mockEnabled = this.isDevelopmentMockEnabled('WECHAT_LOGIN_MOCK_ENABLED')
    let openid = ''
    let mode: 'wechat' | 'mock' = 'wechat'

    if (mockEnabled) {
      openid = 'mock-openid-demo-user'
      mode = 'mock'
    } else {
      if (!dto.code) throw new UnauthorizedException('微信登录凭证不能为空')
      openid = await this.exchangeWechatCode(dto.code)
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
      : await this.prisma.user.upsert({
          where: { openid },
          update: {
            nickname: dto.nickname || undefined,
            avatarUrl: dto.avatarUrl || undefined,
          },
          create: {
            openid,
            nickname: dto.nickname || '微信用户',
            avatarUrl: dto.avatarUrl || '',
            memberLevel: '青铜会员',
          },
        })

    return {
      token: this.tokens.sign(user.id, 'customer'),
      role: 'customer',
      mode,
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
    if (!operator || !operator.enabled || !this.verifyPassword(dto.password, operator.passwordHash)) {
      throw new UnauthorizedException('账号或密码错误')
    }
    await this.prisma.operator.update({ where: { id: operator.id }, data: { lastLoginAt: new Date() } })
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

  async riderWechatLogin(dto: WechatLoginDto) {
    const mockEnabled = this.isDevelopmentMockEnabled('RIDER_WECHAT_LOGIN_MOCK_ENABLED')
    const openid = mockEnabled
      ? 'mock-rider-openid'
      : await this.exchangeWechatCode(dto.code || '', 'RIDER_WECHAT_MINI_APP_ID', 'RIDER_WECHAT_MINI_APP_SECRET')
    const rider = mockEnabled
      ? await this.prisma.riderProfile.upsert({
          where: { id: 'rider-demo' },
          update: { lastLoginAt: new Date() },
          create: {
            id: 'rider-demo',
            openid,
            name: dto.nickname || '演示骑手',
            phone: dto.phone || '13800000000',
            status: 'APPROVED',
            vehicleType: 'ETRIKE',
            vehicleName: '货三轮车',
            handlingQualified: true,
            serviceCity: '宁德市',
            qualifications: {
              create: [
                { serviceId: 'cargo_haul' },
                { serviceId: 'moving_handling' },
              ],
            },
          },
        })
      : await this.prisma.riderProfile.upsert({
          where: { openid },
          update: { lastLoginAt: new Date() },
          create: { openid, name: dto.nickname || '微信骑手', phone: dto.phone || '' },
        })
    return {
      token: this.tokens.sign(rider.id, 'rider'),
      role: 'rider',
      mode: mockEnabled ? 'mock' : 'wechat',
      rider,
    }
  }

  private async exchangeWechatCode(
    code: string,
    appIdKey = 'WECHAT_MINI_APP_ID',
    appSecretKey = 'WECHAT_MINI_APP_SECRET',
  ) {
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
    return data.openid
  }

  private async findOrBootstrapOperator(username: string, password: string) {
    const existing = await this.prisma.operator.findUnique({ where: { username } })
    const bootstrapUsername = this.config.get<string>('OPERATOR_BOOTSTRAP_USERNAME') || 'operator-demo'
    const bootstrapPassword = this.config.get<string>('OPERATOR_BOOTSTRAP_PASSWORD') || 'demo123456'
    const bootstrapEnabled = this.isDevelopmentMockEnabled('OPERATOR_BOOTSTRAP_ENABLED')
    if (existing) {
      if (!existing.passwordHash && bootstrapEnabled && username === bootstrapUsername && password === bootstrapPassword) {
        return this.prisma.operator.update({
          where: { id: existing.id },
          data: { passwordHash: this.hashPassword(password) },
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
