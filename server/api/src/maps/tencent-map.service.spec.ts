import { TencentMapService } from './tencent-map.service'

describe('TencentMapService', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('returns a safe empty result when no key is configured', async () => {
    const config = { get: jest.fn().mockReturnValue('') }
    const service = new TencentMapService(config as never)

    await expect(service.suggestion('万达', '宁德市')).resolves.toEqual({
      provider: 'tencent-map',
      configured: false,
      items: [],
    })
  })

  it('proxies address suggestions through Tencent Map', async () => {
    const config = { get: jest.fn().mockReturnValue('valid-map-key') }
    const service = new TencentMapService(config as never)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 0,
        data: [{ id: 'poi-1', title: '宁德万达广场', location: { lat: 26.6659, lng: 119.5476 } }],
      }),
    }) as jest.MockedFunction<typeof fetch>

    const result = await service.suggestion('万达', '宁德市', 26.66, 119.54)

    expect(result.configured).toBe(true)
    expect(result.items[0].title).toBe('宁德万达广场')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('normalizes matrix distance and duration', async () => {
    const config = { get: jest.fn().mockReturnValue('valid-map-key') }
    const service = new TencentMapService(config as never)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 0,
        result: { rows: [{ elements: [{ distance: 2630, duration: 720 }] }] },
      }),
    }) as jest.MockedFunction<typeof fetch>

    const result = await service.distance(26.68, 119.55, 26.66, 119.54)

    expect(result.route).toEqual({ distanceKm: 2.6, duration: 12, source: '腾讯地图' })
  })
})
