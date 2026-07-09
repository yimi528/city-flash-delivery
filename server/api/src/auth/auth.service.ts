import { Injectable } from '@nestjs/common'
import { OperatorLoginDto, WechatLoginDto } from './auth.dto'

function mockToken(role: string, subjectId: string) {
  return `mock-token:${role}:${subjectId}`
}

@Injectable()
export class AuthService {
  wechatLogin(dto: WechatLoginDto) {
    const userId = 'demo-user'
    return {
      token: mockToken('customer', userId),
      role: 'customer',
      user: {
        id: userId,
        phone: dto.phone || '138****4581',
        nickname: dto.nickname || '微信用户',
        memberLevel: '青铜会员',
      },
    }
  }

  operatorLogin(dto: OperatorLoginDto) {
    const operatorId = dto.operatorId || 'operator-demo'
    return {
      token: mockToken('operator', operatorId),
      role: 'operator',
      operator: {
        id: operatorId,
        name: '同城速送运营员',
        role: 'admin',
      },
    }
  }
}
