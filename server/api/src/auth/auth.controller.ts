import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { OperatorLoginDto, WechatLoginDto } from './auth.dto'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('wechat-login')
  async wechatLogin(@Body() dto: WechatLoginDto) {
    return this.authService.wechatLogin(dto)
  }

  @Post('operator-login')
  async operatorLogin(@Body() dto: OperatorLoginDto) {
    return this.authService.operatorLogin(dto)
  }

  @Post('rider-wechat-login')
  async riderWechatLogin(@Body() dto: WechatLoginDto) {
    return this.authService.riderWechatLogin(dto)
  }
}
