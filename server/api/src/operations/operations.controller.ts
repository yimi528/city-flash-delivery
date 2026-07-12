import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { OperatorAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { QuoteOrderDto, UpdateOrderStatusDto } from '../orders/orders.dto'
import { OrdersService } from '../orders/orders.service'
import { AssignRiderDto, ReviewRiderDto } from '../riders/riders.dto'
import { RidersService } from '../riders/riders.service'

@ApiTags('operations')
@Controller('operations')
@UseGuards(OperatorAuthGuard)
export class OperationsController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ridersService: RidersService,
  ) {}

  @Get('orders')
  async listOrders() {
    return {
      orders: await this.ordersService.list(),
      updatedAt: new Date().toISOString(),
    }
  }

  @Patch('orders/:id/status')
  updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto)
  }

  @Patch('orders/:id/quote')
  quoteOrder(@Param('id') id: string, @Body() dto: QuoteOrderDto) {
    return this.ordersService.quote(id, dto)
  }

  @Post('orders/:id/assign')
  assignOrder(
    @Param('id') id: string,
    @Body() dto: AssignRiderDto,
    @CurrentAuth() auth: AuthPrincipal,
  ) {
    return this.ridersService.assign(auth.subjectId, id, dto)
  }

  @Get('riders/applications')
  riderApplications() {
    return this.ridersService.listApplications()
  }

  @Post('riders/:id/review')
  reviewRider(@Param('id') id: string, @Body() dto: ReviewRiderDto) {
    return this.ridersService.review(id, dto)
  }
}
