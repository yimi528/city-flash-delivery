import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

type ConfigReader = {
  get(key: string): unknown
}

export function isRiderFeatureEnabled(config: ConfigReader) {
  return String(config.get('RIDER_FEATURE_ENABLED') || '').trim().toLowerCase() === 'true'
}

@Injectable()
export class RiderFeatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate() {
    if (!isRiderFeatureEnabled(this.config)) throw new ForbiddenException('骑手端暂未开放')
    return true
  }
}
