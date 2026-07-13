import { Body, Controller, Get, Headers, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { RiderAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { RiderApplicationDto, RiderExceptionDto, RiderHeartbeatDto, RiderLocationDto, RiderOnlineDto, RiderStatusDto, RiderVehicleUpdateDto } from './riders.dto'
import { RidersService } from './riders.service'

@ApiTags('riders')
@Controller('v1/rider')
@UseGuards(RiderAuthGuard)
export class RidersController {
  constructor(private readonly riders: RidersService) {}

  @Get('me')
  me(@CurrentAuth() auth: AuthPrincipal) {
    return this.riders.profile(auth.subjectId)
  }

  @Post('application')
  apply(@CurrentAuth() auth: AuthPrincipal, @Body() dto: RiderApplicationDto) {
    return this.riders.apply(auth.subjectId, dto)
  }

  @Post('online')
  setOnline(@CurrentAuth() auth: AuthPrincipal, @Body() dto: RiderOnlineDto) {
    return this.riders.setOnline(auth.subjectId, dto.online)
  }

  @Post('location')
  updateLocation(@CurrentAuth() auth: AuthPrincipal, @Body() dto: RiderLocationDto) {
    return this.riders.updateLocation(auth.subjectId, dto)
  }

  @Post('heartbeat')
  heartbeat(@CurrentAuth() auth: AuthPrincipal, @Body() dto: RiderHeartbeatDto) {
    return this.riders.heartbeat(auth.subjectId, dto)
  }

  @Put('vehicles')
  updateVehicles(@CurrentAuth() auth: AuthPrincipal, @Body() dto: RiderVehicleUpdateDto) {
    return this.riders.updateVehicles(auth.subjectId, dto)
  }

  @Get('orders/available')
  available(@CurrentAuth() auth: AuthPrincipal) {
    return this.riders.availableOrders(auth.subjectId)
  }

  @Post('orders/:id/claim')
  claim(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey = '',
  ) {
    return this.riders.claim(auth.subjectId, id, idempotencyKey)
  }

  @Get('tasks/current')
  current(@CurrentAuth() auth: AuthPrincipal) {
    return this.riders.currentTasks(auth.subjectId)
  }

  @Get('orders/history')
  history(@CurrentAuth() auth: AuthPrincipal) {
    return this.riders.history(auth.subjectId)
  }

  @Get('income')
  income(@CurrentAuth() auth: AuthPrincipal) {
    return this.riders.income(auth.subjectId)
  }

  @Post('orders/:id/status')
  updateStatus(@CurrentAuth() auth: AuthPrincipal, @Param('id') id: string, @Body() dto: RiderStatusDto) {
    return this.riders.updateStatus(auth.subjectId, id, dto)
  }

  @Post('orders/:id/exception')
  reportException(@CurrentAuth() auth: AuthPrincipal, @Param('id') id: string, @Body() dto: RiderExceptionDto) {
    return this.riders.reportException(auth.subjectId, id, dto)
  }
}
