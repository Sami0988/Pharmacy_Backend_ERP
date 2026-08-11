import { PaginationQueryDto } from '../../../common/pagination';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReportQueryDto {
  startDate?: string;
  endDate?: string;
  format?: 'json' | 'csv' | 'pdf';
}

export class SalesReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class ExpiryReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Expiry within days' })
  @IsOptional()
  @IsString()
  withinDays?: string;
}

export class DeadStockReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Days threshold for dead stock' })
  @IsOptional()
  @IsString()
  daysThreshold?: string;
}
