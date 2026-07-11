import { Module } from '@nestjs/common'
import { MapsController } from './maps.controller'
import { TencentMapService } from './tencent-map.service'
import { WeatherRiskService } from './weather-risk.service'

@Module({
  controllers: [MapsController],
  providers: [TencentMapService, WeatherRiskService],
})
export class MapsModule {}
