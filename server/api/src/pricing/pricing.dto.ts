import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { SERVICE_TYPES, VEHICLE_TYPES, type ServiceType, type VehicleType } from '../common/constants/order.constants'

export class EstimatePriceDto {
  @IsOptional()
  @IsIn(SERVICE_TYPES)
  serviceType?: ServiceType

  @IsOptional()
  @IsIn(VEHICLE_TYPES)
  vehicleType?: VehicleType

  @IsOptional()
  @IsString()
  serviceName?: string

  @IsOptional()
  @IsString()
  vehicleName?: string

  @IsOptional()
  @IsString()
  pricingMode?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  linePrice?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  linePriceMultiplier?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseDistanceKm?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basePrice?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  extraPerKm?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  serviceSurcharge?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDeliveryFee?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  badWeatherMultiplier?: number

  @IsOptional()
  @IsBoolean()
  badWeather?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceKm?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightKg?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productFee?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number
}
