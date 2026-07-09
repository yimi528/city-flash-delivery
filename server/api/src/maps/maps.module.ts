import { Module } from '@nestjs/common'
import { MapsController } from './maps.controller'

@Module({
  controllers: [MapsController],
})
export class MapsModule {}
