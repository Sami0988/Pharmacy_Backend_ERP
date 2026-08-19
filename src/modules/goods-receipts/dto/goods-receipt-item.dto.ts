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

  @ApiProperty({ example: 10, description: 'Number of packs received' })
  @IsInt()
  @IsPositive()
  numberOfPacks: number;

  @ApiProperty({ example: 5, description: 'Number of individual units per pack (e.g., 5 tablets per pack)' })
  @IsInt()
  @IsPositive()
  packSize: number;

  @ApiProperty({ example: 400, description: 'Cost per pack (not per unit)' })
  @IsPositive()
  unitCost: number;

  @ApiPropertyOptional({
    example: 120,
    description:
      'Selling price per individual unit (provide this OR markupPercentage, not both)',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPrice?: number;

  @ApiPropertyOptional({
    example: 50,
    enum: [10, 20, 30, 40, 50],
    description:
      'Markup percentage on per-unit cost (provide this OR sellingPrice, not both). Options: 10, 20, 30, 40, 50',
  })
  @IsIn(MARKUP_PERCENTAGES, {
    message: 'markupPercentage must be one of: 10, 20, 30, 40, 50',
  })
  @IsOptional()
  markupPercentage?: number;

  @ApiPropertyOptional({
    example: 1200,
    description: 'Selling price per pack (optional, for pack sales)',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  packPrice?: number;
}
