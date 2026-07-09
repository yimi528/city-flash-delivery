import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { EstimatePriceDto } from './pricing.dto'
import { PricingService } from './pricing.service'

@ApiTags('pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('estimate')
  estimate(@Body() dto: EstimatePriceDto) {
    return this.pricingService.estimate(dto)
  }
}
