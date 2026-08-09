import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsPositive,
  IsInt,
  IsString,
  IsOptional,
  MinLength,
} from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({ description: 'Batch UUID to transfer' })
  @IsUUID()
  batchId: string;

  @ApiProperty({
    example: 50,
    description: 'Quantity to transfer (positive integer)',
  })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ description: 'Source location UUID (Store). Auto-resolved from user branch if omitted.' })
  @IsUUID()
  @IsOptional()
  fromLocationId?: string;

  @ApiPropertyOptional({ description: 'Destination location UUID (Dispatcher). Auto-resolved from user branch if omitted.' })
  @IsUUID()
  @IsOptional()
  toLocationId?: string;

  @ApiPropertyOptional({ example: 'Restocking dispatcher for morning shift' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  notes?: string;
}
