import { Type } from 'class-transformer'
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

export class RiderOnlineDto {
  @IsBoolean()
  online!: boolean
}

export class RiderLocationDto {
  @Type(() => Number)
  @IsNumber()
  latitude!: number

  @Type(() => Number)
  @IsNumber()
  longitude!: number
}

export class RiderHeartbeatDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number
}

export class RiderStatusDto {
  @IsIn(['ARRIVED', 'DELIVERING', 'COMPLETED'])
  status!: 'ARRIVED' | 'DELIVERING' | 'COMPLETED'

  @IsOptional()
  @IsString()
  note?: string
}

export class RiderApplicationDto {
  @IsString()
  name!: string

  @IsString()
  phone!: string

  @IsIn(['EBIKE', 'ETRIKE', 'VAN', 'MANUAL'])
  vehicleType!: 'EBIKE' | 'ETRIKE' | 'VAN' | 'MANUAL'

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['EBIKE', 'ETRIKE', 'VAN', 'MANUAL'], { each: true })
  vehicleTypes?: Array<'EBIKE' | 'ETRIKE' | 'VAN' | 'MANUAL'>

  @IsOptional()
  @IsString()
  vehicleName?: string

  @IsOptional()
  @IsBoolean()
  requestsHandling?: boolean

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentUrls?: string[]

  @IsOptional()
  @IsString()
  statement?: string

  @IsOptional()
  @IsString()
  verificationStatus?: string

  @IsOptional()
  @IsBoolean()
  agreementAccepted?: boolean
}

export class ReviewRiderDto {
  @IsIn(['APPROVED', 'REJECTED', 'SUSPENDED'])
  status!: 'APPROVED' | 'REJECTED' | 'SUSPENDED'

  @IsIn(['EBIKE', 'ETRIKE', 'VAN', 'MANUAL'])
  vehicleType!: 'EBIKE' | 'ETRIKE' | 'VAN' | 'MANUAL'

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['EBIKE', 'ETRIKE', 'VAN', 'MANUAL'], { each: true })
  vehicleTypes?: Array<'EBIKE' | 'ETRIKE' | 'VAN' | 'MANUAL'>

  @IsString()
  vehicleName!: string

  @IsBoolean()
  handlingQualified!: boolean

  @IsArray()
  @IsString({ each: true })
  serviceIds!: string[]

  @IsOptional()
  @IsString()
  serviceCity?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  maxActiveOrders?: number

  @IsOptional()
  @IsString()
  reason?: string
}

export class RiderVehicleUpdateDto {
  @IsArray()
  @IsIn(['EBIKE', 'ETRIKE', 'VAN', 'MANUAL'], { each: true })
  vehicleTypes!: Array<'EBIKE' | 'ETRIKE' | 'VAN' | 'MANUAL'>
}

export class RiderStatusChangeDto {
  @IsString()
  reason!: string
}

export class RiderExceptionDto {
  @IsString()
  reason!: string

  @IsOptional()
  @IsString()
  evidenceUrl?: string
}

export class AssignRiderDto {
  @IsString()
  riderId!: string

  @IsOptional()
  @IsString()
  note?: string
}
