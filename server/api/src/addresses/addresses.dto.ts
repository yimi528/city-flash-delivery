import { Type } from 'class-transformer'
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export class AddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  detail!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  contact!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tag?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  district?: string

  @IsOptional()
  @IsString()
  @MaxLength(12)
  adcode?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number

  @IsOptional()
  @IsString()
  @MaxLength(160)
  mapPoiId?: string

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}
