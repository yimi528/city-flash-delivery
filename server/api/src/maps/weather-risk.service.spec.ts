import { WeatherRiskService } from './weather-risk.service'

describe('WeatherRiskService', () => {
  it('marks severe forecast codes as bad weather with the configured multiplier', () => {
    const config = {
      get: jest.fn((key: string) => key === 'BAD_WEATHER_MULTIPLIER' ? '1.15' : undefined),
    }
    const service = new WeatherRiskService(config as never)

    const result = service.evaluate({ city: '宁德市', weatherCode: 65, weatherText: '大雨' })

    expect(result.isBadWeather).toBe(true)
    expect(result.multiplier).toBe(1.15)
  })

  it('keeps normal forecasts at the regular price', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) }
    const service = new WeatherRiskService(config as never)

    const result = service.evaluate({ city: '宁德市', weatherCode: 1, weatherText: '晴间多云' })

    expect(result.isBadWeather).toBe(false)
    expect(result.multiplier).toBe(1)
  })

  it('prefers Tencent hourly weather and does not flag normal forecast text', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) }
    const tencentMap = {
      isConfigured: jest.fn().mockReturnValue(true),
      weather: jest.fn().mockResolvedValue({
        provider: 'tencent-weather',
        configured: true,
        result: {
          realtime: { weather: '晴' },
          forecast_1h: [{ weather: '多云' }, { weather: '小雨', precipitation: 1.2 }],
        },
      }),
    }
    const service = new WeatherRiskService(config as never, tencentMap as never)

    const result = await service.resolve({ latitude: 27.5364, longitude: 120.4164 })

    expect(tencentMap.weather).toHaveBeenCalledWith(27.5364, 120.4164)
    expect(result.source).toBe('tencent-weather')
    expect(result.weatherText).toBe('晴')
    expect(result.isBadWeather).toBe(false)
  })

  it('flags a Tencent severe-weather alert instead of inventing a WMO code', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) }
    const tencentMap = {
      isConfigured: jest.fn().mockReturnValue(true),
      weather: jest.fn().mockResolvedValue({
        provider: 'tencent-weather',
        configured: true,
        result: {
          realtime: { weather: '雷雨' },
          alarm: [{ title: '暴雨橙色预警', content: '请减少外出' }],
        },
      }),
    }
    const service = new WeatherRiskService(config as never, tencentMap as never)

    const result = await service.resolve({ latitude: 27.5364, longitude: 120.4164 })

    expect(result.isBadWeather).toBe(true)
    expect(result.reason).toContain('暴雨')
    expect(result.source).toBe('tencent-weather')
  })

  it('fails safe when configured Tencent weather is unavailable', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) }
    const tencentMap = {
      isConfigured: jest.fn().mockReturnValue(true),
      weather: jest.fn().mockRejectedValue(new Error('weather service unavailable')),
    }
    const service = new WeatherRiskService(config as never, tencentMap as never)

    const result = await service.resolve({ latitude: 27.5364, longitude: 120.4164 })

    expect(result.isBadWeather).toBe(false)
    expect(result.source).toBe('forecast-unavailable')
    expect(result.reason).toBe('天气预报暂不可用，按正常天气计价')
  })

  it('returns deterministic normal weather when weather mock is enabled', async () => {
    const config = {
      get: jest.fn((key: string) => key === 'WEATHER_MOCK_ENABLED' ? 'true' : undefined),
    }
    const tencentMap = {
      isConfigured: jest.fn().mockReturnValue(true),
      weather: jest.fn(),
    }
    const service = new WeatherRiskService(config as never, tencentMap as never)

    const result = await service.resolve({ latitude: 27.5364, longitude: 120.4164 })

    expect(tencentMap.weather).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      isBadWeather: false,
      weatherText: '晴',
      source: 'weather-mock',
      reason: '天气预报模拟已开启，按正常天气计价',
    })
  })
})
