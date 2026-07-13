import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { CustomerAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { AuthService } from '../auth/auth.service'
import { SwitchRoleDto } from '../auth/auth.dto'
import { RiderApplicationDto } from './riders.dto'
import { RidersService } from './riders.service'

@ApiTags('account')
@Controller('v1')
@UseGuards(CustomerAuthGuard)
export class CustomerRiderController {
  constructor(
    private readonly auth: AuthService,
    private readonly riders: RidersService,
  ) {}

  @Get('account/roles')
  roles(@CurrentAuth() auth: AuthPrincipal) {
    return this.auth.accountRoles(auth.subjectId)
  }

  @Post('account/switch-role')
  switchRole(@CurrentAuth() auth: AuthPrincipal, @Body() body: SwitchRoleDto) {
    return this.auth.switchRole(auth.subjectId, body.role)
  }

  @Post('rider/applications')
  apply(@CurrentAuth() auth: AuthPrincipal, @Body() dto: RiderApplicationDto) {
    return this.riders.applyForUser(auth.subjectId, dto)
  }

  @Get('rider/applications/current')
  currentApplication(@CurrentAuth() auth: AuthPrincipal) {
    return this.riders.currentApplication(auth.subjectId)
  }

  @Post('rider/applications/:id/withdraw')
  withdraw(@CurrentAuth() auth: AuthPrincipal, @Param('id') id: string) {
    return this.riders.withdrawApplication(auth.subjectId, id)
  }
}
