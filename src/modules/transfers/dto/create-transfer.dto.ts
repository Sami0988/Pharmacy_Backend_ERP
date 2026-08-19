import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsPositive,
  IsInt,
  IsString,
  IsOptional,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'TransferQuantityValidation', async: false })
export class TransferQuantityValidation implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const obj = args.object as CreateTransferDto;
    const hasPacks = obj.numberOfPacks !== undefined && obj.numberOfPacks !== null;
    const hasQty = obj.quantity !== undefined && obj.quantity !== null;

    if (!hasPacks && !hasQty) {
      return false;
    }
    if (hasPacks && hasQty) {
      return false;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Either numberOfPacks or quantity must be provided, but not both';
  }
}

export class CreateTransferDto {
  @ApiProperty({ description: 'Batch UUID to transfer' })
  @IsUUID()
  batchId: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Number of packs to transfer (each pack contains packSize units). Use this for pack transfers.',
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  numberOfPacks?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Exact number of individual units to transfer. Use this for single unit transfers when packSize > 1.',
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  quantity?: number;

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
