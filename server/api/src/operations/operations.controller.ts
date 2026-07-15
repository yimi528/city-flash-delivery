import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { OperatorAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { QuoteOrderDto, UpdateOrderStatusDto } from '../orders/orders.dto'
import { OrdersService } from '../orders/orders.service'
import { AssignRiderDto, ReviewRiderDto, RiderStatusChangeDto } from '../riders/riders.dto'
import { RidersService } from '../riders/riders.service'
import { AuditService } from '../audit/audit.service'

@ApiTags('operations')
@Controller('operations')
@UseGuards(OperatorAuthGuard)
export class OperationsController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ridersService: RidersService,
    private readonly audit: AuditService,
  ) {}

  @Get('orders')
  async listOrders() {
    return {
      orders: await this.ordersService.list(),
      updatedAt: new Date().toISOString(),
    }
  }

  @Patch('orders/:id/status')
  async updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto, @CurrentAuth() auth: AuthPrincipal) {
    const result = await this.ordersService.updateStatus(id, dto)
    await this.audit.record({ action: 'order.status.updated', actorId: auth.subjectId, actorRole: 'operator', resourceType: 'order', resourceId: id, metadata: { status: dto.status, note: dto.note } })
    return result
  }

  @Patch('orders/:id/quote')
  async quoteOrder(@Param('id') id: string, @Body() dto: QuoteOrderDto, @CurrentAuth() auth: AuthPrincipal) {
    const result = await this.ordersService.quote(id, dto)
    await this.audit.record({ action: 'order.quote.updated', actorId: auth.subjectId, actorRole: 'operator', resourceType: 'order', resourceId: id, metadata: { quotedFee: dto.quotedFee } })
    return result
  }

  @Post('orders/:id/assign')
  async assignOrder(
    @Param('id') id: string,
    @Body() dto: AssignRiderDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    const result = await this.ridersService.assign(auth.subjectId, id, dto)
    await this.audit.record({ action: 'order.rider.assigned', actorId: auth.subjectId, actorRole: 'operator', resourceType: 'order', resourceId: id, metadata: { riderId: dto.riderId } })
    return result
  }

  @Get('riders/applications')
  riderApplications() {
    return this.ridersService.listApplications()
  }

  @Post('riders/:id/review')
  async reviewRider(@Param('id') id: string, @Body() dto: ReviewRiderDto, @CurrentAuth() auth: AuthPrincipal) {
    const result = await this.ridersService.review(id, dto, auth.subjectId)
    await this.audit.record({ action: 'rider.application.reviewed', actorId: auth.subjectId, actorRole: 'operator', resourceType: 'rider', resourceId: id, metadata: { status: dto.status, reason: dto.reason } })
    return result
  }

  @Get('riders')
  listRiders(@Query('roleStatus') roleStatus?: string, @Query('workStatus') workStatus?: string) {
    return this.ridersService.listRiders(roleStatus, workStatus)
  }

  @Get('riders/:id')
  riderDetail(@Param('id') id: string) {
    return this.ridersService.detail(id)
  }

  @Post('riders/:id/:action')
  async changeRiderStatus(
    @Param('id') id: string,
    @Param('action') action: 'suspend' | 'restore' | 'resign',
    @Body() dto: RiderStatusChangeDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    const result = await this.ridersService.changeStatus(auth.subjectId, id, action, dto.reason)
    await this.audit.record({ action: 'rider.status.changed', actorId: auth.subjectId, actorRole: 'operator', resourceType: 'rider', resourceId: id, metadata: { action, reason: dto.reason } })
    return result
  }

  @Get('audit')
  auditLogs(@Query('limit') limit?: string) {
    return this.audit.list(Number(limit || 100))
  }
}
