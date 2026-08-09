import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'admin@pharmacy.local',
    description: 'Email to send reset link to',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
