import { Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module'
import { OperationsController } from './operations.controller'

@Module({
  imports: [OrdersModule],
  controllers: [OperationsController],
})
export class OperationsModule {}
