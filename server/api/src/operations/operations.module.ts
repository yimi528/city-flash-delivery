import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { OrdersModule } from '../orders/orders.module'
import { RidersModule } from '../riders/riders.module'
import { OperationsController } from './operations.controller'

@Module({
  imports: [AuthModule, OrdersModule, RidersModule],
  controllers: [OperationsController],
})
export class OperationsModule {}
