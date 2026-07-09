import { Controller, Get, Param } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

@ApiTags('users')
@Controller('users')
export class UsersController {
  @Get(':id')
  findById(@Param('id') id: string) {
    return {
      id,
      phone: id === 'demo-user' ? '138****4581' : '',
      nickname: id === 'demo-user' ? '微信用户' : '新用户',
      memberLevel: '青铜会员',
    }
  }
}
