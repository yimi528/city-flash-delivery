import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MapsModule } from '../maps/maps.module'
import { CatalogController, AdminCatalogController } from './catalog.controller'
import { CatalogService } from './catalog.service'

@Module({
  imports: [AuthModule, MapsModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
