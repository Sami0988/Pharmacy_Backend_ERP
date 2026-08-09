import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: 'Paracetamol 500mg', description: 'Product name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'Paracetamol',
    description: 'Generic/active ingredient name',
  })
  @IsString()
  @IsOptional()
  genericName?: string;

  @ApiPropertyOptional({
    example: 'Analgesics',
    description: 'Product category',
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ example: 'tablet', description: 'Unit of measure' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiPropertyOptional({ example: '500mg', description: 'Strength/dosage' })
  @IsString()
  @IsOptional()
  strength?: string;

  @ApiPropertyOptional({
    example: 100,
    description: 'Minimum stock level before reorder alert',
    default: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  reorderLevel?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether this is a controlled substance',
  })
  @IsBoolean()
  @IsOptional()
  isControlledSubstance?: boolean;
}
