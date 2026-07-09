import { Controller, Get } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiTags } from '@nestjs/swagger'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  health() {
    return {
      status: 'ok',
      service: 'city-flash-api',
      database: Boolean(this.config.get<string>('DATABASE_URL')),
      redis: Boolean(this.config.get<string>('REDIS_URL')),
      time: new Date().toISOString(),
    }
  }
}
