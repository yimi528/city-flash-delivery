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
})
