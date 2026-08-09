import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsInt, IsPositive, IsString, IsNotEmpty } from 'class-validator';

export class CreateSaleReturnDto {
  @ApiProperty({
    description: 'Sale item UUID to return',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  saleItemId: string;

  @ApiProperty({ description: 'Quantity to return', example: 1 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ description: 'Reason for return', example: 'Customer complaint' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
