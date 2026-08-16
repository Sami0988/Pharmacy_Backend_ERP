import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsDateString,
  IsArray,
  ValidateNested,
  MinLength,
  IsOptional,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GoodsReceiptItemDto } from './goods-receipt-item.dto';

export class CreateGoodsReceiptDto {
  @ApiProperty({ description: 'Supplier UUID' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({
    example: 'GRN-2026-001',
    description:
      'Unique GRN number per supplier. If omitted, the system generates one automatically.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  grnNumber?: string;

  @ApiProperty({ example: '2026-08-03', description: 'Receipt date' })
  @IsDateString()
  receiptDate: string;

  @ApiProperty({
    example: false,
    description: 'Whether tax has been paid for this receipt',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  taxPaid?: boolean;

  @ApiProperty({
    enum: ['one_month', 'two_months', 'six_months', 'one_year', 'other'],
    description:
      'Payment due date type. If "other" is selected, paymentDueDate must be provided.',
    required: false,
    default: 'one_month',
  })
  @IsOptional()
  @IsEnum(['one_month', 'two_months', 'six_months', 'one_year', 'other'])
  paymentDueDateType?: 'one_month' | 'two_months' | 'six_months' | 'one_year' | 'other';

  @ApiProperty({
    enum: ['cash', 'credit', 'mobile_bank'],
    description: 'Payment method for this receipt',
    required: false,
    default: 'cash',
  })
  @IsOptional()
  @IsEnum(['cash', 'credit', 'mobile_bank'])
  paymentMethod?: 'cash' | 'credit' | 'mobile_bank';

  @ApiProperty({
    example: '2026-10-03',
    description:
      'Custom payment due date. Required when paymentDueDateType is "other".',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  paymentDueDate?: string;

  @ApiProperty({
    type: [GoodsReceiptItemDto],
    description: 'Items in this receipt',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items: GoodsReceiptItemDto[];
}
