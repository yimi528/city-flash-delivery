import { ForbiddenException } from '@nestjs/common'
import { RiderFeatureGuard, isRiderFeatureEnabled } from './rider-feature'

function config(value?: string) {
  return { get: jest.fn(() => value) }
}

describe('rider feature gate', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(isRiderFeatureEnabled(config())).toBe(false)
    expect(isRiderFeatureEnabled(config('false'))).toBe(false)
    expect(isRiderFeatureEnabled(config('true'))).toBe(true)
  })

  it('rejects rider routes while disabled', () => {
    const guard = new RiderFeatureGuard(config('false') as never)

    expect(() => guard.canActivate()).toThrow(ForbiddenException)
    expect(() => guard.canActivate()).toThrow('骑手端暂未开放')
  })

  it('allows rider routes only when explicitly enabled', () => {
    const guard = new RiderFeatureGuard(config('true') as never)

    expect(guard.canActivate()).toBe(true)
  })
})
