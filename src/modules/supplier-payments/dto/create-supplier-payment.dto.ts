import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsPositive,
  IsDateString,
  IsString,
  IsIn,
  IsOptional,
  MinLength,
} from 'class-validator';

export class CreateSupplierPaymentDto {
  @ApiProperty({ description: 'Supplier UUID' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({ description: 'Goods Receipt UUID to apply payment to' })
  @IsUUID()
  grnId: string;

  @ApiProperty({ example: 500.0, description: 'Amount being paid' })
  @IsPositive()
  amountPaid: number;

  @ApiPropertyOptional({
    example: '2026-08-03',
    description: 'Payment date (defaults to today)',
  })
  @IsDateString()
  @IsOptional()
  paymentDate?: string;

  @ApiProperty({
    enum: ['cash', 'bank_transfer', 'mobile_money', 'other'],
    description: 'Payment method',
  })
  @IsString()
  @IsIn(['cash', 'bank_transfer', 'mobile_money', 'other'])
  method: string;

  @ApiPropertyOptional({ example: 'Partial payment for GRN-001' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  notes?: string;
}
