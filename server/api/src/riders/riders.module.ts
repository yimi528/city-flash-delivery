import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RidersController } from './riders.controller'
import { RidersService } from './riders.service'

@Module({
  imports: [AuthModule],
  controllers: [RidersController],
  providers: [RidersService],
  exports: [RidersService],
})
export class RidersModule {}
