import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsInt, IsPositive, IsOptional, IsIn } from 'class-validator';

export class SaleItemDto {
  @ApiProperty({
    description: 'Item UUID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'Quantity to sell', example: 2 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({
    description:
      'Batch UUID (optional — omitted for auto FEFO selection, provided for manual override)',
  })
  @IsUUID()
  @IsOptional()
  batchId?: string;

  @ApiPropertyOptional({
    description: 'Sale unit type: "single" for individual units, "pack" for full packs',
    enum: ['single', 'pack'],
    default: 'single',
  })
  @IsIn(['single', 'pack'])
  @IsOptional()
  saleUnit?: 'single' | 'pack';
}
