import { Type } from 'class-transformer'
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator'
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

  @IsString()
  pickupName!: string

  @IsString()
  pickupDetail!: string

  @IsString()
  dropoffName!: string

  @IsString()
  dropoffDetail!: string

  @IsOptional()
  @IsString()
  item?: string

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
  @IsString()
  remark?: string
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUS_FLOW)
  status!: OrderStatus

  @IsOptional()
  @IsString()
  note?: string
}
