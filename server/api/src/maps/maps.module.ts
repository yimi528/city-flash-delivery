import { Module } from '@nestjs/common'
import { MapsController } from './maps.controller'
import { WeatherRiskService } from './weather-risk.service'

@Module({
  controllers: [MapsController],
  providers: [WeatherRiskService],
})
export class MapsModule {}
