import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsPositive, IsOptional, IsNumber, Min, IsString, MinLength } from 'class-validator';

export class UpdateBatchPackDto {
  @ApiPropertyOptional({ example: 10, description: 'New number of packs' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  numberOfPacks?: number;

  @ApiPropertyOptional({ description: 'Location ID to apply stock adjustment (Store or Dispatcher)' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ example: 10, description: 'Units per pack' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  packSize?: number;

  @ApiPropertyOptional({ example: 500, description: 'Updated unit cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ example: 750, description: 'Updated selling price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({ example: 5000, description: 'Updated pack price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  packPrice?: number;

  @ApiPropertyOptional({ example: 'Supplier sent wrong pack size', description: 'Reason for the update' })
  @IsString()
  @MinLength(3)
  reason: string;
}
