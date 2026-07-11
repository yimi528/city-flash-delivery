import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const TENCENT_MAP_API = 'https://apis.map.qq.com'

type TencentResponse<T> = {
  status: number
  message?: string
  data?: T
  result?: T
}

type TencentSuggestion = {
  id?: string
  title?: string
  address?: string
  category?: string
  location?: { lat?: number; lng?: number }
  ad_info?: { city?: string; district?: string; adcode?: string }
  _distance?: number
}

type TencentReverseResult = {
  address?: string
  formatted_addresses?: { recommend?: string; rough?: string }
  address_component?: { city?: string; district?: string; street?: string; street_number?: string; adcode?: string }
  pois?: Array<{ id?: string; title?: string; address?: string; category?: string; location?: { lat?: number; lng?: number } }>
}

type TencentDistanceResult = {
  rows?: Array<{ elements?: Array<{ distance?: number; duration?: number }> }>
}

@Injectable()
export class TencentMapService {
  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    const key = this.getKey()
    return Boolean(key && !/YOUR|DEMO|TEST|请|填入|替换/i.test(key))
  }

  async suggestion(keyword: string, region: string, latitude?: number, longitude?: number) {
    if (!this.isConfigured() || !keyword.trim()) {
      return { provider: 'tencent-map', configured: this.isConfigured(), items: [] }
    }
    const data = await this.request<TencentSuggestion[]>('/ws/place/v1/suggestion', {
      keyword: keyword.trim(),
      region,
      region_fix: 1,
      policy: 1,
      get_subpois: 1,
      page_index: 1,
      page_size: 10,
      location: this.formatOptionalPoint(latitude, longitude),
    })
    return { provider: 'tencent-map', configured: true, items: data || [] }
  }

  async reverseGeocode(latitude: number, longitude: number) {
    if (!this.isConfigured()) {
      return { provider: 'tencent-map', configured: false, result: null }
    }
    const result = await this.request<TencentReverseResult>('/ws/geocoder/v1/', {
      location: `${latitude},${longitude}`,
      get_poi: 1,
    })
    return { provider: 'tencent-map', configured: true, result }
  }

  async distance(
    fromLatitude: number,
    fromLongitude: number,
    toLatitude: number,
    toLongitude: number,
    mode = 'bicycling',
  ) {
    if (!this.isConfigured()) {
      return { provider: 'tencent-map', configured: false, route: null }
    }
    const result = await this.request<TencentDistanceResult>('/ws/distance/v1/matrix', {
      mode,
      from: `${fromLatitude},${fromLongitude}`,
      to: `${toLatitude},${toLongitude}`,
    })
    const element = result.rows?.[0]?.elements?.[0]
    const meters = Number(element?.distance || 0)
    if (!meters) return { provider: 'tencent-map', configured: true, route: null }
    return {
      provider: 'tencent-map',
      configured: true,
      route: {
        distanceKm: Math.max(0.1, Math.round((meters / 1000) * 10) / 10),
        duration: element?.duration ? Math.max(1, Math.round(Number(element.duration) / 60)) : null,
        source: '腾讯地图',
      },
    }
  }

  private async request<T>(path: string, params: Record<string, string | number | undefined>) {
    const url = new URL(`${TENCENT_MAP_API}${path}`)
    Object.entries({ ...params, key: this.getKey(), output: 'json' }).forEach(([key, value]) => {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`Tencent map HTTP ${response.status}`)
      const body = (await response.json()) as TencentResponse<T>
      if (body.status !== 0) throw new Error(body.message || `Tencent map status ${body.status}`)
      const value = body.data ?? body.result
      if (value === undefined) throw new Error('Tencent map response is empty')
      return value
    } finally {
      clearTimeout(timeout)
    }
  }

  private getKey() {
    return String(this.config.get<string>('TENCENT_MAP_KEY') || '').trim()
  }

  private formatOptionalPoint(latitude?: number, longitude?: number) {
    if (latitude === undefined || longitude === undefined) return undefined
    return `${latitude},${longitude}`
  }
}
