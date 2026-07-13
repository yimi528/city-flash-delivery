import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RidersController } from './riders.controller'
import { CustomerRiderController } from './customer-rider.controller'
import { RidersService } from './riders.service'

@Module({
  imports: [AuthModule],
  controllers: [RidersController, CustomerRiderController],
  providers: [RidersService],
  exports: [RidersService],
})
export class RidersModule {}
