import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsPositive, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class FefoSuggestionQueryDto {
  @ApiProperty({ description: 'Item UUID to get suggestions for' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({ description: 'Location UUID to check stock at. Auto-resolved from user branch if omitted.' })
  @IsUUID()
  @IsOptional()
  locationId?: string;

  @ApiProperty({ example: 50, description: 'Quantity needed' })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  quantityNeeded: number;
}

export interface FefoSuggestionItem {
  batchId: string;
  batchNo: string;
  expiryDate: string;
  packSize: number;
  availableQuantity: number;
  availablePacks: number;
  daysUntilExpiry: number;
}

export interface FefoSuggestionResponse {
  itemId: string;
  locationId: string;
  quantityNeeded: number;
  suggestions: FefoSuggestionItem[];
  totalAvailable: number;
}
