import { Injectable } from '@nestjs/common'

@Injectable()
export class RateLimitService {
  private readonly fallback = new Map<string, { count: number; resetAt: number }>()

  async consume(key: string, limit: number, windowSeconds: number) {
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

}
