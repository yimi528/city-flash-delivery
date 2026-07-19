import { IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator'

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
  @IsNotEmpty()
  password!: string

}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  currentPassword!: string

  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/, {
    message: '新密码至少 12 位，并包含大小写字母、数字和特殊字符',
  })
  newPassword!: string
}

export class SwitchRoleDto {
  @IsString()
  @IsNotEmpty()
  role!: 'customer' | 'rider'
}
