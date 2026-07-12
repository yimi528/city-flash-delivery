import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { CustomerAuthGuard, OperatorAuthGuard, RiderAuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { AuthTokenService } from './auth-token.service'

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthTokenService, CustomerAuthGuard, OperatorAuthGuard, RiderAuthGuard],
  exports: [AuthService, AuthTokenService, CustomerAuthGuard, OperatorAuthGuard, RiderAuthGuard],
})
export class AuthModule {}
