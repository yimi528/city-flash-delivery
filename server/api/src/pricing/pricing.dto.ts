import { IsIn, IsNumber, IsOptional, Min } from 'class-validator'
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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceKm?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightKg?: number
}
