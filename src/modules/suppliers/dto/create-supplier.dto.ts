import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({
    example: 'MedSupply Co.',
    description: 'Supplier company name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+1234567890', description: 'Contact phone number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({
    example: '123 Medical Ave',
    description: 'Physical address',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    example: 'LIC-2024-001',
    description: 'Pharmacy license number',
  })
  @IsString()
  @IsOptional()
  licenseNo?: string;

  @IsString()
  @IsOptional()
  licenseNumber?: string;
}
