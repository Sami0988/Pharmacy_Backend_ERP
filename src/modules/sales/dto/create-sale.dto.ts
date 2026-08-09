import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsIn,
  IsArray,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SaleItemDto } from './sale-item.dto';

export class CreateSaleDto {
  @ApiPropertyOptional({
    description: 'Customer UUID (omit for walk-in)',
  })
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiProperty({
    description: 'Payment method',
    enum: ['cash', 'mobile_money', 'card', 'credit'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['cash', 'mobile_money', 'card', 'credit'])
  paymentMethod: string;

  @ApiProperty({
    description: 'Line items to sell',
    type: [SaleItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
