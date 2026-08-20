import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsInt, IsString, MinLength, IsOptional } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty({ description: 'Batch UUID' })
  @IsUUID()
  batchId: string;

  @ApiProperty({ description: 'Location UUID (Store or Dispatcher)' })
  @IsUUID()
  locationId: string;

  @ApiProperty({
    example: 50,
    description: 'The new absolute stock quantity to set',
  })
  @IsInt()
  newQuantity: number;

  @ApiProperty({
    example: 'Damaged goods write-off',
    description: 'Reason for the adjustment',
  })
  @IsString()
  @MinLength(3)
  reason: string;

  @ApiPropertyOptional({
    example: 'tablets',
    description: 'Unit of measurement for the adjustment (e.g., tablets, bottles, boxes)',
  })
  @IsString()
  @IsOptional()
  adjustmentUnit?: string;
}
