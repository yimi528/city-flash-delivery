import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { CustomerAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { AddressDto } from './addresses.dto'
import { AddressesService } from './addresses.service'

@ApiTags('addresses')
@Controller('addresses')
@UseGuards(CustomerAuthGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentAuth() auth: AuthPrincipal) {
    return this.addresses.list(auth.subjectId)
  }

  @Post()
  create(@Body() dto: AddressDto, @CurrentAuth() auth: AuthPrincipal) {
    return this.addresses.create(auth.subjectId, dto)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: AddressDto, @CurrentAuth() auth: AuthPrincipal) {
    return this.addresses.update(auth.subjectId, id, dto)
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentAuth() auth: AuthPrincipal) {
    return this.addresses.delete(auth.subjectId, id)
  }
}
