import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: 'John Doe', description: 'Customer name' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    example: '+256700000000',
    description: 'Phone number',
  })
  @IsString()
  @IsOptional()
  phone?: string;
}
