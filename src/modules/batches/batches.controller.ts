import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { BatchesService } from './batches.service';
import { PaginationQueryDto } from '../../common/pagination';
import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min } from 'class-validator';

class BatchesQueryDto extends PaginationQueryDto {
  itemId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiringWithinDays?: number;
}

@ApiTags('Batches')
@Controller('batches')
export class BatchesController {
  constructor(private readonly service: BatchesService) {}

  @Get()
  @ApiOperation({ summary: 'List batches with pagination, search, and filtering' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Search by batch number' })
  @ApiQuery({ name: 'itemId', required: false, description: 'Filter by item UUID' })
  @ApiQuery({ name: 'expiringWithinDays', required: false, description: 'Show batches expiring within N days' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order', enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of batches' })
  findAll(@Query() query: BatchesQueryDto) {
    return this.service.findAll({
      itemId: query.itemId,
      search: query.search,
      expiringWithinDays: query.expiringWithinDays,
      page: query.page!,
      limit: query.limit!,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get batch details with quantities by location' })
  @ApiParam({ name: 'id', description: 'Batch UUID' })
  @ApiResponse({
    status: 200,
    description: 'Batch details with item, GRN, supplier, and quantities',
  })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Get(':id/qr')
  @ApiOperation({ summary: 'Get QR code signed URL for a batch' })
  @ApiParam({ name: 'id', description: 'Batch UUID' })
  @ApiResponse({
    status: 200,
    description: 'Returns signed URL for QR code image',
  })
  @ApiResponse({ status: 404, description: 'Batch or QR code not found' })
  async getQrCode(@Param('id') id: string) {
    const url = await this.service.getQrCodeUrl(id);
    return { url };
  }
}
