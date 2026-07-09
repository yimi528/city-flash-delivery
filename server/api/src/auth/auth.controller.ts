import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { OperatorLoginDto, WechatLoginDto } from './auth.dto'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('wechat-login')
  wechatLogin(@Body() dto: WechatLoginDto) {
    return this.authService.wechatLogin(dto)
  }

  @Post('operator-login')
  operatorLogin(@Body() dto: OperatorLoginDto) {
    return this.authService.operatorLogin(dto)
  }
}
