import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

@ApiTags('addresses')
@Controller('addresses')
export class AddressesController {
  @Get()
  list(@Query('userId') userId = 'demo-user') {
    return [
      {
        id: 'a1',
        userId,
        name: '恒生一品苑',
        detail: '东侨经济技术开发区福宁北路 6 号',
        contact: '陈先生',
        phone: '13800004581',
        latitude: 26.6824,
        longitude: 119.5558,
        isDefault: true,
      },
      {
        id: 'a2',
        userId,
        name: '宁德万达广场',
        detail: '天湖东路 1 号 2 号门',
        contact: '林女士',
        phone: '13600001234',
        latitude: 26.6659,
        longitude: 119.5476,
        isDefault: false,
      },
    ]
  }
}
