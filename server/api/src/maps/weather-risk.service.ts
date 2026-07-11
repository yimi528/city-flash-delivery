import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const BAD_WEATHER_KEYWORDS = [
  '暴雨',
  '大雨',
  '雷阵雨',
  '强雷电',
  '台风',
  '大风',
  '暴雪',
  '大雪',
  '冰雹',
  '冻雨',
  '道路结冰',
  '沙尘暴',
  '寒潮',
]

const BAD_WEATHER_CODES = new Set([63, 65, 66, 67, 73, 75, 77, 82, 85, 86, 95, 96, 99])
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: '晴',
  1: '晴间多云',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '强毛毛雨',
  61: '小雨',
  63: '中到大雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中到大雪',
  75: '大雪',
  77: '雪粒',
  80: '阵雨',
  81: '中等阵雨',
  82: '强阵雨',
  85: '阵雪',
  86: '强阵雪',
  95: '雷暴',
  96: '雷暴伴冰雹',
  99: '强雷暴伴冰雹',
}

export type WeatherRiskInput = {
  city?: string
  latitude?: number
  longitude?: number
  weatherText?: string
  forecastText?: string
  windScale?: number
  windSpeedKmh?: number
  precipitationMm?: number
  weatherCode?: number
  alertText?: string
  forecastSource?: string
}

@Injectable()
export class WeatherRiskService {
  constructor(private readonly config: ConfigService) {}

  async resolve(input: WeatherRiskInput = {}) {
    const override = this.parseOverride(this.config.get<string>('BAD_WEATHER_OVERRIDE'))
    if (override !== null || this.hasForecastSignal(input) || !input.latitude || !input.longitude) {
      return this.evaluate(input, override)
    }

    try {
      const forecast = await this.fetchOpenMeteoForecast(input.latitude, input.longitude)
      return this.evaluate({ ...input, ...forecast }, override)
    } catch {
      return {
        ...this.evaluate(
          { ...input, weatherText: '天气预报暂不可用', forecastSource: 'forecast-unavailable' },
          override,
        ),
        reason: '天气预报暂不可用，按正常天气计价',
      }
    }
  }

  evaluate(
    input: WeatherRiskInput = {},
    override = this.parseOverride(this.config.get<string>('BAD_WEATHER_OVERRIDE')),
  ) {
    const text = [input.weatherText, input.forecastText, input.alertText].filter(Boolean).join(' ')
    const matchedKeyword = BAD_WEATHER_KEYWORDS.find((keyword) => text.includes(keyword))
    const badByCode =
      typeof input.weatherCode === 'number' && BAD_WEATHER_CODES.has(input.weatherCode)
    const badByWind = typeof input.windScale === 'number' && input.windScale >= 6
    const badByWindSpeed = typeof input.windSpeedKmh === 'number' && input.windSpeedKmh >= 39
    const badByRain = typeof input.precipitationMm === 'number' && input.precipitationMm >= 8
    const isBadWeather =
      override ?? Boolean(matchedKeyword || badByCode || badByWind || badByWindSpeed || badByRain)
    const reason = this.reason({
      override,
      matchedKeyword,
      badByCode,
      badByWind,
      badByWindSpeed,
      badByRain,
    })

    return {
      city: input.city || '宁德市',
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      isBadWeather,
      badWeather: isBadWeather,
      multiplier: isBadWeather ? 1.2 : 1,
      weatherText: input.weatherText || input.forecastText || '暂无恶劣天气预警',
      reason,
      source: input.forecastSource || (text ? 'forecast-rule' : 'forecast-placeholder'),
      checkedAt: new Date().toISOString(),
    }
  }

  private async fetchOpenMeteoForecast(latitude: number, longitude: number) {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(latitude))
    url.searchParams.set('longitude', String(longitude))
    url.searchParams.set('hourly', 'weather_code,precipitation,wind_speed_10m')
    url.searchParams.set('forecast_hours', '3')
    url.searchParams.set('timezone', 'Asia/Shanghai')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`weather forecast HTTP ${response.status}`)
      const data = (await response.json()) as {
        hourly?: {
          weather_code?: number[]
          precipitation?: number[]
          wind_speed_10m?: number[]
        }
      }
      const codes = (data.hourly?.weather_code || []).slice(0, 3)
      const precipitation = (data.hourly?.precipitation || []).slice(0, 3)
      const windSpeed = (data.hourly?.wind_speed_10m || []).slice(0, 3)
      const weatherCode = codes.find((code) => BAD_WEATHER_CODES.has(code)) ?? codes[0]
      const weatherText = this.weatherCodeLabel(weatherCode)

      return {
        weatherCode,
        weatherText,
        forecastText: codes.map((code) => this.weatherCodeLabel(code)).join(' '),
        precipitationMm: this.maxNumber(precipitation),
        windSpeedKmh: this.maxNumber(windSpeed),
        forecastSource: 'open-meteo',
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private hasForecastSignal(input: WeatherRiskInput) {
    return Boolean(
      input.weatherText ||
      input.forecastText ||
      input.alertText ||
      input.windScale !== undefined ||
      input.windSpeedKmh !== undefined ||
      input.precipitationMm !== undefined ||
      input.weatherCode !== undefined,
    )
  }

  private parseOverride(value?: string) {
    if (value === 'true') return true
    if (value === 'false') return false
    return null
  }

  private reason(input: {
    override: boolean | null
    matchedKeyword?: string
    badByCode: boolean
    badByWind: boolean
    badByWindSpeed: boolean
    badByRain: boolean
  }) {
    if (input.override === true) return '后台已开启恶劣天气强制判断'
    if (input.override === false) return '后台已关闭恶劣天气强制判断'
    if (input.matchedKeyword) return `天气预报包含“${input.matchedKeyword}”`
    if (input.badByCode) return '未来3小时预报命中恶劣天气代码'
    if (input.badByWind || input.badByWindSpeed) return '天气预报显示风力达到恶劣天气阈值'
    if (input.badByRain) return '天气预报显示降水强度达到恶劣天气阈值'
    return '天气预报未触发恶劣天气规则'
  }

  private maxNumber(values: number[]) {
    const numbers = values.filter((value) => Number.isFinite(value))
    return numbers.length ? Math.max(...numbers) : undefined
  }

  private weatherCodeLabel(code?: number) {
    if (code === undefined) return '暂无恶劣天气预警'
    return WEATHER_CODE_LABELS[code] || `天气代码${code}`
  }
}
