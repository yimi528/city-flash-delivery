import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PrismaService } from '../common/prisma/prisma.service'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', service: 'city-flash-api', time: new Date().toISOString() }
  }

  @Get('ready')
  ready() {
    return this.health()
  }

  @Get()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return {
        status: 'ok',
        service: 'city-flash-api',
        database: true,
        time: new Date().toISOString(),
      }
    } catch {
      throw new ServiceUnavailableException('Database health check failed')
    }
  }
}
