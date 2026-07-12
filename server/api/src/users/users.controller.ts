import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { CustomerAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { PrismaService } from '../common/prisma/prisma.service'

@ApiTags('users')
@Controller('users')
@UseGuards(CustomerAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  findMe(@CurrentAuth() auth: AuthPrincipal) {
    return this.prisma.user.findUnique({
      where: { id: auth.subjectId },
      select: { id: true, phone: true, nickname: true, avatarUrl: true, memberLevel: true },
    })
  }
}
