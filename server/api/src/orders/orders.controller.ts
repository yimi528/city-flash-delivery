import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { CustomerAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { CreateOrderDto, QuoteDecisionDto } from './orders.dto'
import { OrdersService } from './orders.service'

@ApiTags('orders')
@Controller('orders')
@UseGuards(CustomerAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@CurrentAuth() auth: AuthPrincipal) {
    return this.ordersService.list(auth.subjectId)
  }

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentAuth() auth: AuthPrincipal) {
    dto.userId = auth.subjectId
    return this.ordersService.create(dto)
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentAuth() auth: AuthPrincipal) {
    return this.findOwnedOrder(id, auth.subjectId)
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentAuth() auth: AuthPrincipal) {
    return this.ordersService.cancel(id, auth.subjectId)
  }

  @Patch(':id/quote/confirm')
  async confirmQuote(@Param('id') id: string, @Body() dto: QuoteDecisionDto, @CurrentAuth() auth: AuthPrincipal) {
    await this.findOwnedOrder(id, auth.subjectId)
    return this.ordersService.confirmQuote(id, dto)
  }

  @Patch(':id/quote/reject')
  async rejectQuote(@Param('id') id: string, @Body() dto: QuoteDecisionDto, @CurrentAuth() auth: AuthPrincipal) {
    await this.findOwnedOrder(id, auth.subjectId)
    return this.ordersService.rejectQuote(id, dto)
  }

  private async findOwnedOrder(id: string, userId: string) {
    const order = await this.ordersService.findById(id)
    if (order.userId !== userId) throw new ForbiddenException('无权访问该订单')
    return order
  }
}
