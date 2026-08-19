import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsDateString,
  IsInt,
  IsPositive,
  IsNumber,
  IsOptional,
  Min,
  IsIn,
} from 'class-validator';
import { MARKUP_PERCENTAGES } from './goods-receipt-item.dto';

export class UpdateBatchItemDto {
  @ApiProperty({ description: 'Batch UUID (required to identify which batch to edit)' })
  @IsUUID()
  batchId: string;

  @ApiPropertyOptional({ example: 'BATCH-001-REV', description: 'Updated batch number' })
  @IsString()
  @IsOptional()
  batchNo?: string;

  @ApiPropertyOptional({ example: '2028-06-30', description: 'Updated expiry date' })
  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @ApiPropertyOptional({ example: 15, description: 'Updated number of packs' })
  @IsInt()
  @IsPositive()
  @IsOptional()
  numberOfPacks?: number;

  @ApiPropertyOptional({ example: 5, description: 'Updated pack size (units per pack)' })
  @IsInt()
  @IsPositive()
  @IsOptional()
  packSize?: number;

  @ApiPropertyOptional({ example: 350, description: 'Updated cost per pack' })
  @IsPositive()
  @IsOptional()
  unitCost?: number;

  @ApiPropertyOptional({ example: 105, description: 'Updated selling price per unit' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPrice?: number;

  @ApiPropertyOptional({
    example: 30,
    enum: [10, 20, 30, 40, 50],
    description: 'Updated markup percentage',
  })
  @IsIn(MARKUP_PERCENTAGES, {
    message: 'markupPercentage must be one of: 10, 20, 30, 40, 50',
  })
  @IsOptional()
  markupPercentage?: number;

  @ApiPropertyOptional({
    example: 1200,
    description: 'Updated selling price per pack',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  packPrice?: number;
}
