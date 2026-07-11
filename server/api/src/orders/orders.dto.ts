import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import {
  ORDER_STATUS_FLOW,
  SERVICE_TYPES,
  VEHICLE_TYPES,
  type OrderStatus,
  type ServiceType,
  type VehicleType,
} from '../common/constants/order.constants'

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  userId?: string

  @IsIn(SERVICE_TYPES)
  serviceType!: ServiceType

  @IsIn(VEHICLE_TYPES)
  vehicleType!: VehicleType

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
  @Min(1)
  badWeatherMultiplier?: number

  @IsOptional()
  @IsBoolean()
  badWeather?: boolean

  @IsString()
  pickupName!: string

  @IsString()
  pickupDetail!: string

  @IsOptional()
  @IsString()
  pickupContact?: string

  @IsOptional()
  @IsString()
  pickupPhone?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pickupLat?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pickupLng?: number

  @IsString()
  dropoffName!: string

  @IsString()
  dropoffDetail!: string

  @IsOptional()
  @IsString()
  dropoffContact?: string

  @IsOptional()
  @IsString()
  dropoffPhone?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dropoffLat?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dropoffLng?: number

  @IsOptional()
  @IsString()
  item?: string

  @IsOptional()
  @IsString()
  buyItems?: string

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

  @IsOptional()
  @IsString()
  remark?: string
}

export class UpdateOrderStatusDto {
  @IsOptional()
  @IsIn(ORDER_STATUS_FLOW)
  status?: OrderStatus

  @IsOptional()
  @IsString()
  note?: string
}

export class QuoteOrderDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quotedFee!: number

  @IsOptional()
  @IsString()
  quoteNote?: string
}

export class QuoteDecisionDto {
  @IsOptional()
  @IsString()
  note?: string
}
