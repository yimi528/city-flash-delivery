import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { CustomerAuthGuard, OperatorAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { CarpoolQuoteDto, HandlingQuoteDto, UpdatePricingRuleDto, UpdateServiceConfigDto } from './catalog.dto'
import { CatalogService } from './catalog.service'

@ApiTags('catalog')
@Controller('v1')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('services')
  listServices() {
    return this.catalog.listServices()
  }

  @Get('carpool/routes')
  listCarpoolRoutes() {
    return this.catalog.listCarpoolRoutes()
  }

  @Post('quotes/carpool')
  @UseGuards(CustomerAuthGuard)
  quoteCarpool(@CurrentAuth() auth: AuthPrincipal, @Body() dto: CarpoolQuoteDto) {
    return this.catalog.quoteCarpool(auth.subjectId, dto)
  }

  @Post('quotes/handling')
  @UseGuards(CustomerAuthGuard)
  quoteHandling(@CurrentAuth() auth: AuthPrincipal, @Body() dto: HandlingQuoteDto) {
    return this.catalog.quoteHandling(auth.subjectId, dto)
  }
}

@ApiTags('admin-catalog')
@Controller('v1/admin')
@UseGuards(OperatorAuthGuard)
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Put('service-configs/:id')
  updateService(@Param('id') id: string, @Body() dto: UpdateServiceConfigDto) {
    return this.catalog.updateService(id, dto)
  }

  @Put('pricing-rules/:serviceId')
  updatePricing(@Param('serviceId') serviceId: string, @Body() dto: UpdatePricingRuleDto) {
    return this.catalog.updatePricing(serviceId, dto)
  }
}
