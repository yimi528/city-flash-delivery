import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { WeatherRiskService } from './weather-risk.service'

function optionalNumber(value?: string) {
  if (value === undefined || value === '') return undefined
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

@ApiTags('maps')
@Controller('maps')
export class MapsController {
  constructor(private readonly weatherRiskService: WeatherRiskService) {}

  @Get('suggestion')
  suggestion(@Query('keyword') keyword = '') {
    return {
      keyword,
      provider: 'tencent-map-placeholder',
      items: [],
    }
  }

  @Get('weather-risk')
  weatherRisk(
    @Query('city') city = '宁德市',
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('weather') weatherText?: string,
    @Query('forecast') forecastText?: string,
    @Query('windScale') windScale?: string,
    @Query('windSpeedKmh') windSpeedKmh?: string,
    @Query('precipitationMm') precipitationMm?: string,
    @Query('weatherCode') weatherCode?: string,
    @Query('alert') alertText?: string,
  ) {
    return this.weatherRiskService.resolve({
      city,
      latitude: optionalNumber(lat),
      longitude: optionalNumber(lng),
      weatherText,
      forecastText,
      windScale: optionalNumber(windScale),
      windSpeedKmh: optionalNumber(windSpeedKmh),
      precipitationMm: optionalNumber(precipitationMm),
      weatherCode: optionalNumber(weatherCode),
      alertText,
    })
  }
}
