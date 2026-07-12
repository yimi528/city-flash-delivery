import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { AddressesController } from './addresses.controller'

@Module({
  imports: [AuthModule],
  controllers: [AddressesController],
})
export class AddressesModule {}
