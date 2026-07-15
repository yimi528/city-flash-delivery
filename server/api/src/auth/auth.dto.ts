import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator'

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

  @IsOptional()
  @IsString()
  avatarUrl?: string
}

export class OperatorLoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string

  @IsString()
  @MinLength(6)
  password!: string
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  currentPassword!: string

  @IsString()
  @MinLength(12)
  newPassword!: string
}

export class SwitchRoleDto {
  @IsString()
  @IsNotEmpty()
  role!: 'customer' | 'rider'
}
