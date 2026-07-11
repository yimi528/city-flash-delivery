import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { TencentMapService } from './tencent-map.service'
import { WeatherRiskService } from './weather-risk.service'

function optionalNumber(value?: string) {
  if (value === undefined || value === '') return undefined
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function requiredNumber(value: string | undefined, name: string) {
  const numberValue = optionalNumber(value)
  if (numberValue === undefined) throw new BadRequestException(`${name} must be a valid number`)
  return numberValue
}

@ApiTags('maps')
@Controller('maps')
export class MapsController {
  constructor(
    private readonly weatherRiskService: WeatherRiskService,
    private readonly tencentMapService: TencentMapService,
  ) {}

  @Get('suggestion')
  suggestion(
    @Query('keyword') keyword = '',
    @Query('region') region = '宁德市',
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.tencentMapService.suggestion(keyword, region, optionalNumber(lat), optionalNumber(lng))
  }

  @Get('reverse-geocode')
  reverseGeocode(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    return this.tencentMapService.reverseGeocode(
      requiredNumber(lat, 'lat'),
      requiredNumber(lng, 'lng'),
    )
  }

  @Get('distance')
  distance(
    @Query('fromLat') fromLat?: string,
    @Query('fromLng') fromLng?: string,
    @Query('toLat') toLat?: string,
    @Query('toLng') toLng?: string,
    @Query('mode') mode = 'bicycling',
  ) {
    return this.tencentMapService.distance(
      requiredNumber(fromLat, 'fromLat'),
      requiredNumber(fromLng, 'fromLng'),
      requiredNumber(toLat, 'toLat'),
      requiredNumber(toLng, 'toLng'),
      mode,
    )
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
