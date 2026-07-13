import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MapsModule } from '../maps/maps.module'
import { PricingModule } from '../pricing/pricing.module'
import { PaymentsModule } from '../payments/payments.module'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'

@Module({
  imports: [AuthModule, MapsModule, PricingModule, PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
