import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateSupplierDto {
  @ApiPropertyOptional({ example: 'MedSupply Co.' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '123 Medical Ave' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'LIC-2024-001' })
  @IsString()
  @IsOptional()
  licenseNo?: string;

  @IsString()
  @IsOptional()
  licenseNumber?: string;
}
