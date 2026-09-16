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

  it('queries hourly weather and alerts by the delivery coordinates', async () => {
    const config = { get: jest.fn().mockReturnValue('valid-map-key') }
    const service = new TencentMapService(config as never)
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 0,
        result: { realtime: { weather: '晴' }, forecast_1h: [{ weather: '多云' }] },
      }),
    }) as jest.MockedFunction<typeof fetch>
    global.fetch = fetchMock

    const result = await service.weather(27.5364, 120.4164)
    const url = new URL(String(fetchMock.mock.calls[0][0]))

    expect(result).toMatchObject({ provider: 'tencent-weather', configured: true })
    expect(result.result).toMatchObject({ realtime: { weather: '晴' } })
    expect(url.pathname).toBe('/ws/weather/v1/')
    expect(url.searchParams.get('location')).toBe('27.5364,120.4164')
    expect(url.searchParams.get('type')).toBe('hours')
    expect(url.searchParams.get('added_fields')).toBe('alarm')
  })

  it('geocodes an address text into map coordinates', async () => {
    const config = { get: jest.fn().mockReturnValue('valid-map-key') }
    const service = new TencentMapService(config as never)
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 0,
        result: {
          title: '福鼎一中',
          location: { lat: 27.3325, lng: 120.2165 },
        },
      }),
    }) as jest.MockedFunction<typeof fetch>
    global.fetch = fetchMock

    const result = await service.geocode('福鼎市福鼎一中桐山街道1号', '福鼎市')
    const url = new URL(String(fetchMock.mock.calls[0][0]))

    expect(result.configured).toBe(true)
    expect(result.result?.location).toEqual({ lat: 27.3325, lng: 120.2165 })
    expect(url.pathname).toBe('/ws/geocoder/v1/')
    expect(url.searchParams.get('address')).toBe('福鼎市福鼎一中桐山街道1号')
    expect(url.searchParams.get('region')).toBe('福鼎市')
  })

  it('keeps usable coordinates without calling the map provider', async () => {
    const config = { get: jest.fn().mockReturnValue('valid-map-key') }
    const service = new TencentMapService(config as never)
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as jest.MockedFunction<typeof fetch>

    await expect(service.resolveAddressPoint({ latitude: 27.3325, longitude: 120.2165 }))
      .resolves.toEqual({ latitude: 27.3325, longitude: 120.2165 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats the 0/0 client fallback as missing coordinates and geocodes the address', async () => {
    const config = { get: jest.fn().mockReturnValue('valid-map-key') }
    const service = new TencentMapService(config as never)
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 0, result: { location: { lat: 27.3011, lng: 120.2381 } } }),
    }) as jest.MockedFunction<typeof fetch>
    global.fetch = fetchMock

    await expect(service.resolveAddressPoint({
      city: '福鼎市',
      name: '福鼎万达',
      detail: '天湖路2号',
      latitude: 0,
      longitude: 0,
    })).resolves.toEqual({ latitude: 27.3011, longitude: 120.2381 })

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('address')).toBe('福鼎市福鼎万达天湖路2号')
  })

  it('returns null instead of throwing when geocoding is unavailable', async () => {
    const service = new TencentMapService({ get: jest.fn().mockReturnValue('') } as never)
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as jest.MockedFunction<typeof fetch>

    await expect(service.resolveAddressPoint({ name: '福鼎一中', latitude: 0, longitude: 0 })).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    const failing = new TencentMapService({ get: jest.fn().mockReturnValue('valid-map-key') } as never)
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as jest.MockedFunction<typeof fetch>
    await expect(failing.resolveAddressPoint({ name: '福鼎一中' })).resolves.toBeNull()
  })
})
