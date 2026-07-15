import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { OperatorLoginDto, WechatLoginDto, ChangePasswordDto } from './auth.dto'
import { CurrentAuth } from './current-auth.decorator'
import { OperatorAuthGuard } from './auth.guard'
import { AuthPrincipal } from './auth-token.service'

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

  @Post('operator/change-password')
  @UseGuards(OperatorAuthGuard)
  changeOperatorPassword(@Body() dto: ChangePasswordDto, @CurrentAuth() auth: AuthPrincipal) {
    return this.authService.changeOperatorPassword(auth.subjectId, dto)
  }

}
