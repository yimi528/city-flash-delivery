import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { CustomerAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { NotificationsService } from './notifications.service'

@ApiTags('notifications')
@Controller('v1/notifications')
@UseGuards(CustomerAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentAuth() auth: AuthPrincipal, @Query('limit') limit?: string) {
    return this.notifications.list(auth.subjectId, Number(limit || 50))
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentAuth() auth: AuthPrincipal) {
    return this.notifications.markRead(auth.subjectId, id)
  }

  @Post('read-all')
  markAllRead(@CurrentAuth() auth: AuthPrincipal) {
    return this.notifications.markAllRead(auth.subjectId)
  }
}
