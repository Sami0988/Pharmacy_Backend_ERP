import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsDateString,
  IsInt,
  IsPositive,
  MinLength,
  IsNumber,
  IsOptional,
  Min,
  IsIn,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

export const MARKUP_PERCENTAGES = [10, 20, 30, 40, 50] as const;
export type MarkupPercentage = (typeof MARKUP_PERCENTAGES)[number];

@ValidatorConstraint({ name: 'SellingPriceOrMarkup', async: false })
export class SellingPriceOrMarkupConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: any, args: ValidationArguments) {
    const obj = args.object as GoodsReceiptItemDto;
    return (
      (obj.sellingPrice !== undefined && obj.sellingPrice !== null) ||
      (obj.markupPercentage !== undefined && obj.markupPercentage !== null)
    );
  }

  defaultMessage() {
    return 'Either sellingPrice or markupPercentage must be provided';
  }
}

export class GoodsReceiptItemDto {
  @ApiProperty({ description: 'Item UUID' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: 'BATCH-001', description: 'Batch number' })
  @IsString()
  @MinLength(1)
  batchNo: string;

  @ApiProperty({
    example: '2027-12-31',
    description: 'Expiry date (must be in the future)',
  })
  @IsDateString()
  expiryDate: string;

  @ApiProperty({ example: 100, description: 'Quantity received' })
  @IsInt()
  @IsPositive()
  quantityReceived: number;

  @ApiProperty({ example: 10.5, description: 'Cost per unit' })
  @IsPositive()
  unitCost: number;

  @ApiPropertyOptional({
    example: 15.0,
    description:
      'Selling price per unit (provide this OR markupPercentage, not both)',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPrice?: number;

  @ApiPropertyOptional({
    example: 30,
    enum: [10, 20, 30, 40, 50],
    description:
      'Markup percentage on unit cost (provide this OR sellingPrice, not both). Options: 10, 20, 30, 40, 50',
  })
  @IsIn(MARKUP_PERCENTAGES, {
    message: 'markupPercentage must be one of: 10, 20, 30, 40, 50',
  })
  @IsOptional()
  markupPercentage?: number;
}
