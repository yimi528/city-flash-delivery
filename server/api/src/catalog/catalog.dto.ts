import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

export class CarpoolQuoteDto {
  @IsString()
  routeId!: string

  @IsIn(['OUTBOUND', 'RETURN'])
  direction!: 'OUTBOUND' | 'RETURN'

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  passengerCount!: number

  @IsString()
  @IsNotEmpty()
  addressName!: string

  @IsString()
  @IsNotEmpty()
  addressDetail!: string

  @IsOptional()
  @IsString()
  addressCity?: string

  @IsOptional()
  @IsString()
  addressDistrict?: string

  @IsOptional()
  @IsString()
  addressAdcode?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  addressLat?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  addressLng?: number
}

export class HandlingQuoteDto {
  @IsBoolean()
  requiresDelivery!: boolean

  @IsString()
  pickupName!: string

  @IsString()
  pickupDetail!: string

  @Type(() => Number)
  @IsNumber()
  pickupLat!: number

  @Type(() => Number)
  @IsNumber()
  pickupLng!: number

  @IsOptional()
  @IsString()
  dropoffName?: string

  @IsOptional()
  @IsString()
  dropoffDetail?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dropoffLat?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dropoffLng?: number
}

export class UpdateServiceConfigDto {
  @IsOptional()
  @IsString()
  vehicleType?: string

  @IsOptional()
  @IsString()
  vehicleName?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  passengerCapacity?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class UpdatePricingRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseFeeFen!: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  deliveryStartFeeFen!: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  includedDistanceMeters!: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  perKmFen!: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumFeeFen!: number

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  maxDistanceMeters!: number
}
