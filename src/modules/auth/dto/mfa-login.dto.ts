import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class MfaLoginDto {
  @ApiProperty({ description: 'MFA pending token from initial login' })
  @IsString()
  @IsNotEmpty()
  mfaToken: string;

  @ApiProperty({ example: '123456', description: '6-digit TOTP code' })
  @IsString()
  @Length(6, 6, { message: 'MFA code must be 6 digits' })
  @Matches(/^\d{6}$/, { message: 'MFA code must be 6 digits' })
  @IsNotEmpty()
  code: string;
}
