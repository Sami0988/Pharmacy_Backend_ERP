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
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination';
import { IsOptional, IsString, IsBooleanString } from 'class-validator';

class ItemsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsBooleanString()
  includeDeleted?: string;
}

@ApiTags('Items')
@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('jwt-access')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all items with pagination, search, and filtering',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number',
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    type: Number,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name or generic name',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by category',
  })
  @ApiQuery({
    name: 'unit',
    required: false,
    description: 'Filter by unit',
  })
  @ApiQuery({
    name: 'includeDeleted',
    required: false,
    description: 'Include soft-deleted items (admin only)',
    type: Boolean,
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Sort field (e.g. name, category, createdAt)',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    description: 'Sort order (asc or desc)',
    enum: ['asc', 'desc'],
  })
  @ApiResponse({ status: 200, description: 'Paginated list of items' })
  findAll(@Query() query: ItemsQueryDto) {
    return this.itemsService.findAll({
      search: query.search,
      category: query.category,
      unit: query.unit,
      includeDeleted: query.includeDeleted === 'true',
      page: query.page!,
      limit: query.limit!,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiParam({ name: 'id', description: 'Item UUID' })
  @ApiQuery({
    name: 'includeDeleted',
    required: false,
    description: 'Include soft-deleted items (admin only)',
    type: Boolean,
  })
  @ApiResponse({ status: 200, description: 'Item details' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.itemsService.findOne(id, includeDeleted === 'true');
  }

  @Post()
  @Roles('admin', 'store_keeper')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new item' })
  @ApiResponse({ status: 201, description: 'Item created' })
  @ApiResponse({ status: 409, description: 'Item already exists' })
  create(@Body() createItemDto: CreateItemDto) {
    return this.itemsService.create(createItemDto);
  }

  @Patch(':id')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Update an item' })
  @ApiParam({ name: 'id', description: 'Item UUID' })
  @ApiResponse({ status: 200, description: 'Item updated' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateItemDto: UpdateItemDto,
  ) {
    return this.itemsService.update(id, updateItemDto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete an item (sets deleted_at)' })
  @ApiParam({ name: 'id', description: 'Item UUID' })
  @ApiResponse({ status: 200, description: 'Item soft-deleted' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemsService.softDelete(id);
  }

  @Get(':id/substitutes')
  @ApiOperation({ summary: 'Find substitute items with Dispatcher stock' })
  @ApiParam({ name: 'id', description: 'Item UUID' })
  @ApiQuery({
    name: 'branchId',
    description: 'Branch UUID to check Dispatcher stock',
  })
  @ApiResponse({
    status: 200,
    description: 'Substitute items with available stock',
  })
  @ApiResponse({ status: 404, description: 'Item not found' })
  findSubstitutes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('branchId') branchId: string,
  ) {
    return this.itemsService.findSubstitutes(id, branchId);
  }
}
