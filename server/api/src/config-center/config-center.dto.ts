import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator'

export class SaveConfigDraftDto {
  @IsIn(['PRICING', 'SERVICE_AREA', 'SYSTEM'])
  category!: 'PRICING' | 'SERVICE_AREA' | 'SYSTEM'

  @IsInt()
  @Min(1)
  baseVersion!: number

  @IsObject()
  payload!: Record<string, unknown>
}

export class PublishConfigDto {
  @IsIn(['PRICING', 'SERVICE_AREA', 'SYSTEM'])
  category!: 'PRICING' | 'SERVICE_AREA' | 'SYSTEM'
}

export class ServiceAreaCheckDto {
  @IsString()
  serviceId!: string

  @IsOptional()
  @IsObject()
  pickup?: { latitude?: number; longitude?: number }

  @IsOptional()
  @IsObject()
  dropoff?: { latitude?: number; longitude?: number }
}

export class PricingQuoteDto {
  @IsString()
  taskId!: string

  @IsOptional()
  @IsString()
  routeId?: string

  @IsOptional()
  @IsIn(['OUTBOUND', 'RETURN'])
  direction?: 'OUTBOUND' | 'RETURN'

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  passengerCount?: number

  @IsOptional()
  @IsObject()
  pickup?: Record<string, unknown>

  @IsOptional()
  @IsObject()
  dropoff?: Record<string, unknown>

  @IsOptional()
  @IsInt()
  @Min(0)
  weightKg?: number

  @IsOptional()
  @Min(0)
  productFeeFen?: number

  @IsOptional()
  requiresDelivery?: boolean
}
