import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { CustomerAuthGuard, OperatorAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { ConfigCenterService } from './config-center.service'
import { PricingQuoteDto, PublishConfigDto, SaveConfigDraftDto, ServiceAreaCheckDto } from './config-center.dto'
import { AuditService } from '../audit/audit.service'

@ApiTags('config-center')
@Controller('v1')
export class ConfigCenterController {
  constructor(private readonly configs: ConfigCenterService) {}

  @Get('app-config')
  appConfig() {
    return this.configs.getAppConfig()
  }

  @Post('quotes')
  @UseGuards(CustomerAuthGuard)
  quote(@CurrentAuth() auth: AuthPrincipal, @Body() dto: PricingQuoteDto) {
    return this.configs.quote(auth.subjectId, dto)
  }

  @Post('service-areas/check')
  @UseGuards(CustomerAuthGuard)
  checkArea(@Body() dto: ServiceAreaCheckDto) {
    return this.configs.checkServiceArea(dto)
  }
}

@ApiTags('admin-config-center')
@Controller('v1/admin')
@UseGuards(OperatorAuthGuard)
export class AdminConfigCenterController {
  constructor(private readonly configs: ConfigCenterService, private readonly audit: AuditService) {}

  @Get('pricing')
  pricing() {
    return this.configs.getConfig('PRICING')
  }

  @Get('service-areas')
  serviceAreas() {
    return this.configs.getConfig('SERVICE_AREA')
  }

  @Get('system-settings')
  systemSettings() {
    return this.configs.getConfig('SYSTEM')
  }

  @Put('config-drafts')
  saveDraft(@CurrentAuth() auth: AuthPrincipal, @Body() dto: SaveConfigDraftDto) {
    return this.configs.saveDraft(auth.subjectId, dto).then((result) => {
      void this.audit.record({ actorId: auth.subjectId, actorRole: auth.role, action: 'config.draft.saved', resourceType: 'config', resourceId: dto.category })
      return result
    })
  }

  @Post('config-publish')
  publish(@CurrentAuth() auth: AuthPrincipal, @Body() dto: PublishConfigDto) {
    return this.configs.publish(auth.subjectId, dto.category).then((result) => {
      void this.audit.record({ actorId: auth.subjectId, actorRole: auth.role, action: 'config.published', resourceType: 'config', resourceId: dto.category })
      return result
    })
  }

  @Get('config-revisions')
  revisions(@Query('category') category?: 'PRICING' | 'SERVICE_AREA' | 'SYSTEM') {
    return this.configs.listRevisions(category)
  }
}
