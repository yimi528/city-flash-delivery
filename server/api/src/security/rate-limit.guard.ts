import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { RateLimitService } from './rate-limit.service'

type RateLimitRequest = {
  method?: string
  url?: string
  originalUrl?: string
  ip?: string
  headers?: Record<string, string | string[] | undefined>
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimitService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RateLimitRequest>()
    const path = request.originalUrl || request.url || ''
    if (path.includes('/health')) return true

    const method = request.method || 'GET'
    const ipHeader = request.headers?.['x-forwarded-for']
    const forwardedIp = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader?.split(',')[0]
    const identity = forwardedIp?.trim() || request.ip || 'unknown'
    let limit = 180
    let windowSeconds = 60
    let bucket = 'general'
    if (method === 'POST' && /\/auth\/operator-login$/.test(path)) {
      limit = 5
      windowSeconds = 15 * 60
      bucket = 'operator-login'
    } else if (method === 'POST' && /\/auth\/wechat-login$/.test(path)) {
      limit = 20
      bucket = 'wechat-login'
    } else if (/\/payments\//.test(path)) {
      limit = 30
      bucket = 'payments'
    } else if (/\/rider\/.*claim/.test(path)) {
      limit = 20
      bucket = 'rider-claim'
    } else if (/\/operations\//.test(path)) {
      limit = 120
      bucket = 'operations'
    }

    const result = await this.limiter.consume(`city-flash:rate:${bucket}:${identity}`, limit, windowSeconds)
    if (!result.allowed) throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS)
    return true
  }
}
