import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination';
import { IsBooleanString, IsOptional } from 'class-validator';

class SuppliersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsBooleanString()
  includeDeleted?: string;
}

@ApiTags('Suppliers')
@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('jwt-access')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'List all suppliers with pagination, search, and filtering' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name' })
  @ApiQuery({ name: 'includeDeleted', required: false, description: 'Include soft-deleted suppliers (admin only)', type: Boolean })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order', enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of suppliers' })
  findAll(@Query() query: SuppliersQueryDto) {
    return this.suppliersService.findAll({
      search: query.search,
      includeDeleted: query.includeDeleted === 'true',
      page: query.page!,
      limit: query.limit!,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get('balances')
  @ApiOperation({ summary: 'Get outstanding balances for all suppliers' })
  @ApiResponse({ status: 200, description: 'List of supplier balances (totalOwed, totalPaid, balance)' })
  getBalances() {
    return this.suppliersService.getBalances();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier by ID' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  @ApiQuery({
    name: 'includeDeleted',
    required: false,
    description: 'Include soft-deleted suppliers (admin only)',
    type: Boolean,
  })
  @ApiResponse({ status: 200, description: 'Supplier details' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.suppliersService.findOne(id, includeDeleted === 'true');
  }

  @Post()
  @Roles('admin', 'store_keeper')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new supplier' })
  @ApiResponse({ status: 201, description: 'Supplier created' })
  @ApiResponse({ status: 409, description: 'Supplier already exists' })
  create(@Body() createSupplierDto: CreateSupplierDto) {
    return this.suppliersService.create(createSupplierDto);
  }

  @Patch(':id')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Update a supplier' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  @ApiResponse({ status: 200, description: 'Supplier updated' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, updateSupplierDto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete a supplier' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  @ApiResponse({ status: 200, description: 'Supplier permanently deleted' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.hardDelete(id);
  }
}
