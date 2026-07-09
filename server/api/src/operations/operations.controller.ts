import { Body, Controller, Get, Param, Patch } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { UpdateOrderStatusDto } from '../orders/orders.dto'
import { OrdersService } from '../orders/orders.service'

@ApiTags('operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('orders')
  listOrders() {
    return {
      orders: this.ordersService.list(),
      updatedAt: new Date().toISOString(),
    }
  }

  @Patch('orders/:id/status')
  updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto)
  }
}
