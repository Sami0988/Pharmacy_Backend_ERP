import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsDateString,
  IsBoolean,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateBatchItemDto } from './update-batch-item.dto';

export class UpdateGoodsReceiptDto {
  @ApiPropertyOptional({ example: '2026-08-15', description: 'Updated receipt date' })
  @IsDateString()
  @IsOptional()
  receiptDate?: string;

  @ApiPropertyOptional({ example: true, description: 'Updated tax paid status' })
  @IsBoolean()
  @IsOptional()
  taxPaid?: boolean;

  @ApiPropertyOptional({
    example: 'two_months',
    enum: ['one_month', 'two_months', 'six_months', 'one_year', 'other'],
    description: 'Updated payment due date type',
  })
  @IsString()
  @IsOptional()
  paymentDueDateType?: 'one_month' | 'two_months' | 'six_months' | 'one_year' | 'other';

  @ApiPropertyOptional({ example: '2026-10-15', description: 'Updated payment due date (required when type is other)' })
  @IsDateString()
  @IsOptional()
  paymentDueDate?: string;

  @ApiPropertyOptional({
    example: 'cash',
    enum: ['cash', 'credit', 'mobile_bank'],
    description: 'Updated payment method',
  })
  @IsString()
  @IsOptional()
  paymentMethod?: 'cash' | 'credit' | 'mobile_bank';

  @ApiPropertyOptional({
    type: [UpdateBatchItemDto],
    description: 'Array of batch items to update',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateBatchItemDto)
  @IsOptional()
  items?: UpdateBatchItemDto[];
}
