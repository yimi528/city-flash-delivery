import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AddressesModule } from './addresses/addresses.module'
import { AuthModule } from './auth/auth.module'
import { HealthModule } from './health/health.module'
import { MapsModule } from './maps/maps.module'
import { OperationsModule } from './operations/operations.module'
import { OrdersModule } from './orders/orders.module'
import { PricingModule } from './pricing/pricing.module'
import { PaymentsModule } from './payments/payments.module'
import { PrismaModule } from './common/prisma/prisma.module'
import { UsersModule } from './users/users.module'
import { CatalogModule } from './catalog/catalog.module'
import { RidersModule } from './riders/riders.module'
import { ConfigCenterModule } from './config-center/config-center.module'
import { AuditModule } from './audit/audit.module'
import { SecurityModule } from './security/security.module'
import { NotificationsModule } from './notifications/notifications.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    AuditModule,
    SecurityModule,
    NotificationsModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AddressesModule,
    OrdersModule,
    OperationsModule,
    PricingModule,
    PaymentsModule,
    MapsModule,
    CatalogModule,
    RidersModule,
    ConfigCenterModule,
  ],
})
export class AppModule {}
