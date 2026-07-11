import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CreateOrderDto, QuoteDecisionDto, UpdateOrderStatusDto } from './orders.dto'
import { OrdersService } from './orders.service'

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@Query('userId') userId?: string) {
    return this.ordersService.list(userId)
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto)
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.ordersService.findById(id)
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto)
  }

  @Patch(':id/quote/confirm')
  confirmQuote(@Param('id') id: string, @Body() dto: QuoteDecisionDto) {
    return this.ordersService.confirmQuote(id, dto)
  }

  @Patch(':id/quote/reject')
  rejectQuote(@Param('id') id: string, @Body() dto: QuoteDecisionDto) {
    return this.ordersService.rejectQuote(id, dto)
  }
}
