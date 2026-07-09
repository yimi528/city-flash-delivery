import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AddressesModule } from './addresses/addresses.module'
import { AuthModule } from './auth/auth.module'
import { HealthModule } from './health/health.module'
import { MapsModule } from './maps/maps.module'
import { OperationsModule } from './operations/operations.module'
import { OrdersModule } from './orders/orders.module'
import { PricingModule } from './pricing/pricing.module'
import { PrismaModule } from './common/prisma/prisma.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AddressesModule,
    OrdersModule,
    OperationsModule,
    PricingModule,
    MapsModule,
  ],
})
export class AppModule {}
