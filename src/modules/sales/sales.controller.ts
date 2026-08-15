import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { PaginationQueryDto } from '../../common/pagination';
import { IsOptional, IsString } from 'class-validator';

class SalesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;
  @IsOptional()
  @IsString()
  customerId?: string;
  @IsOptional()
  @IsString()
  soldBy?: string;
  @IsOptional()
  @IsString()
  fromDate?: string;
  @IsOptional()
  @IsString()
  toDate?: string;
}

@ApiTags('Sales')
@ApiBearerAuth('jwt-access')
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @Roles('admin', 'cashier')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a new sale' })
  @ApiResponse({ status: 201, description: 'Sale created with receipt URL' })
  @ApiResponse({ status: 400, description: 'Validation failure on one or more items' })
  create(@Body() dto: CreateSaleDto, @CurrentUser('sub') userId: string, @CurrentUser('branchId') branchId: string) {
    return this.salesService.create(dto, userId, branchId);
  }

  @Get()
  @ApiOperation({ summary: 'List all sales with pagination, search, and filtering' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Search by branch, customer, or cashier name' })
  @ApiQuery({ name: 'branchId', required: false, description: 'Filter by branch UUID' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer UUID' })
  @ApiQuery({ name: 'soldBy', required: false, description: 'Filter by cashier user UUID' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'toDate', required: false, description: 'End date (ISO string)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order', enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of sales' })
  findAll(@Query() query: SalesQueryDto) {
    return this.salesService.findAll({
      page: query.page!,
      limit: query.limit!,
      search: query.search,
      branchId: query.branchId,
      customerId: query.customerId,
      soldBy: query.soldBy,
      fromDate: query.fromDate,
      toDate: query.toDate,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sale details with line items' })
  @ApiParam({ name: 'id', description: 'Sale UUID' })
  @ApiResponse({ status: 200, description: 'Sale details' })
  @ApiResponse({ status: 404, description: 'Sale not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.findById(id);
  }

  @Get(':id/receipt-url')
  @ApiOperation({ summary: 'Get signed receipt URL' })
  @ApiParam({ name: 'id', description: 'Sale UUID' })
  @ApiResponse({ status: 200, description: 'Signed receipt URL' })
  @ApiResponse({ status: 404, description: 'No receipt available' })
  getReceiptUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.getReceiptUrl(id);
  }

  @Post(':id/regenerate-receipt')
  @Roles('admin', 'cashier')
  @ApiOperation({ summary: 'Regenerate receipt PDF' })
  @ApiParam({ name: 'id', description: 'Sale UUID' })
  @ApiResponse({ status: 200, description: 'New receipt URL' })
  @ApiResponse({ status: 503, description: 'PDF generation failed' })
  regenerateReceipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.regenerateReceipt(id);
  }

  @Post(':saleId/returns')
  @Roles('admin', 'cashier')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a sale return' })
  @ApiParam({ name: 'saleId', description: 'Sale UUID' })
  @ApiResponse({ status: 201, description: 'Return created' })
  @ApiResponse({ status: 400, description: 'Return quantity exceeds returnable' })
  @ApiResponse({ status: 404, description: 'Sale or sale item not found' })
  createReturn(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body() dto: CreateSaleReturnDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.salesService.createReturn(saleId, dto, userId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete a sale and reverse stock' })
  @ApiParam({ name: 'id', description: 'Sale UUID' })
  @ApiResponse({ status: 200, description: 'Sale deleted and stock reversed' })
  @ApiResponse({ status: 404, description: 'Sale not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.salesService.hardDelete(id, userId);
  }
}
