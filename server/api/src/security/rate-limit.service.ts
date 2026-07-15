import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name)
  private readonly redisUrl?: string
  private redis?: Redis
  private readonly fallback = new Map<string, { count: number; resetAt: number }>()

  constructor(private readonly config: ConfigService) {
    this.redisUrl = this.config.get<string>('REDIS_URL')
  }

  private getRedis() {
    if (!this.redis && this.redisUrl) {
      this.redis = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false })
    }
    return this.redis
  }

  async consume(key: string, limit: number, windowSeconds: number) {
    const redis = this.getRedis()
    if (redis) {
      try {
        const count = await redis.incr(key)
        if (count === 1) await redis.expire(key, windowSeconds)
        return { allowed: count <= limit, count, retryAfter: windowSeconds }
      } catch (error) {
        this.logger.warn(`Redis rate limiter unavailable; using local fallback: ${error instanceof Error ? error.message : error}`)
      }
    }

    const now = Date.now()
    const existing = this.fallback.get(key)
    const state = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + windowSeconds * 1000 }
      : existing
    state.count += 1
    this.fallback.set(key, state)
    if (this.fallback.size > 10000) {
      for (const [entryKey, entry] of this.fallback) if (entry.resetAt <= now) this.fallback.delete(entryKey)
    }
    return { allowed: state.count <= limit, count: state.count, retryAfter: Math.max(1, Math.ceil((state.resetAt - now) / 1000)) }
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit().catch(() => undefined)
  }
}
