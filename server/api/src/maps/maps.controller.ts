import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

@ApiTags('maps')
@Controller('maps')
export class MapsController {
  @Get('suggestion')
  suggestion(@Query('keyword') keyword = '') {
    return {
      keyword,
      provider: 'tencent-map-placeholder',
      items: [],
    }
  }
}
