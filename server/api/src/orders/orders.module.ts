import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PricingModule } from '../pricing/pricing.module'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'

@Module({
  imports: [AuthModule, PricingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
