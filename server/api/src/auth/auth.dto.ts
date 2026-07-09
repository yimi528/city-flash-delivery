import { IsOptional, IsString } from 'class-validator'

export class WechatLoginDto {
  @IsOptional()
  @IsString()
  code?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  nickname?: string
}

export class OperatorLoginDto {
  @IsOptional()
  @IsString()
  operatorId?: string
}
