import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { FefoSuggestionQueryDto } from './dto/fefo-suggestion-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { PaginationQueryDto } from '../../common/pagination';

class TransfersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by batch UUID' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Filter by item UUID' })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @IsOptional()
  @IsString()
  toDate?: string;
}

@ApiTags('Transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly service: TransfersService) {}

  @Get('suggest')
  @ApiOperation({ summary: 'Get FEFO batch suggestions for a transfer' })
  @ApiQuery({ name: 'itemId', description: 'Item UUID' })
  @ApiQuery({ name: 'locationId', description: 'Location UUID to check' })
  @ApiQuery({ name: 'quantityNeeded', description: 'Quantity needed' })
  @ApiResponse({
    status: 200,
    description:
      'Batches sorted by expiry (soonest first) with available quantities',
  })
  getFefoSuggestions(@Query() query: FefoSuggestionQueryDto, @CurrentUser('branchId') branchId?: string | null) {
    return this.service.getFefoSuggestions(
      query.itemId,
      query.locationId,
      query.quantityNeeded,
      branchId,
    );
  }

  @Post()
  @Roles('admin', 'store_keeper')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a stock transfer (Store -> Dispatcher)' })
  @ApiResponse({
    status: 201,
    description: 'Transfer created with updated stock quantities',
  })
  @ApiResponse({
    status: 400,
    description: 'Insufficient stock, expired batch, or same location',
  })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  create(@Body() dto: CreateTransferDto, @CurrentUser('sub') userId: string, @CurrentUser('branchId') branchId?: string | null) {
    return this.service.create(dto, userId, branchId);
  }

  @Get()
  @ApiOperation({ summary: 'List all transfers with pagination, search, and filtering' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Search by batch number or item name' })
  @ApiQuery({ name: 'batchId', required: false, description: 'Filter by batch UUID' })
  @ApiQuery({ name: 'itemId', required: false, description: 'Filter by item UUID' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'toDate', required: false, description: 'End date (ISO string)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order', enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of transfers' })
  findAll(@Query() query: TransfersQueryDto) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.itemId ?? '');
    return this.service.findAll({
      page: query.page!,
      limit: query.limit!,
      search: isUuid ? query.search : (query.itemId ?? query.search),
      batchId: query.batchId,
      itemId: isUuid ? query.itemId : undefined,
      fromDate: query.fromDate,
      toDate: query.toDate,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer details with location names' })
  @ApiParam({ name: 'id', description: 'Transfer UUID' })
  @ApiResponse({
    status: 200,
    description: 'Transfer details with batch, item, and location names',
  })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
