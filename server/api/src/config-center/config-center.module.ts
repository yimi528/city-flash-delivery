import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MapsModule } from '../maps/maps.module'
import { ConfigCenterController, AdminConfigCenterController } from './config-center.controller'
import { ConfigCenterService } from './config-center.service'

@Module({
  imports: [AuthModule, MapsModule],
  controllers: [ConfigCenterController, AdminConfigCenterController],
  providers: [ConfigCenterService],
  exports: [ConfigCenterService],
})
export class ConfigCenterModule {}
