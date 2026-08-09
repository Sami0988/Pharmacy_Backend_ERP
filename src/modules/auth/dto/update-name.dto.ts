import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateNameDto {
  @ApiProperty({ example: 'John Doe', description: 'New display name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
