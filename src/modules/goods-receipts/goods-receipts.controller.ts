import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { GoodsReceiptsService } from './goods-receipts.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import { GoodsReceiptItemDto } from './dto/goods-receipt-item.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination';
import { IsOptional, IsString } from 'class-validator';

class GoodsReceiptsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  supplierId?: string;
  @IsOptional()
  @IsString()
  supplier?: string;
  @IsOptional()
  @IsString()
  branchId?: string;
}

@ApiTags('Goods Receipts')
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(
    private readonly service: GoodsReceiptsService,
  ) {}

  @Post()
  @Roles('admin', 'store_keeper')
  @UseInterceptors(
    FileInterceptor('invoiceDocument', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Invoice file must be PDF, JPG, or PNG'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a goods receipt with batch items' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        invoiceDocument: {
          type: 'string',
          format: 'binary',
          description: 'Invoice file (PDF, JPG, PNG, max 10MB)',
        },
        supplierId: { type: 'string', format: 'uuid' },
        grnNumber: { type: 'string', example: 'GRN-2026-001' },
        receiptDate: { type: 'string', example: '2026-08-03' },
        taxPaid: { type: 'boolean', default: false },
        paymentDueDateType: {
          type: 'string',
          enum: ['one_month', 'two_months', 'six_months', 'one_year', 'other'],
          default: 'one_month',
        },
        paymentDueDate: { type: 'string', format: 'date', description: 'Required when paymentDueDateType is other' },
        items: { type: 'string', description: 'JSON array of items' },
      },
      required: ['supplierId', 'receiptDate', 'items'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'GRN created with batches and stock movements',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 409,
    description: 'GRN number already exists for this supplier',
  })
  async create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() currentUser: Record<string, unknown>,
  ) {
    const userId = currentUser?.sub as string | undefined;
    const branchId = currentUser?.branchId as string | undefined;

    if (!userId) {
      throw new BadRequestException(
        'Current user identifier is required to create a goods receipt',
      );
    }

    if (!branchId) {
      throw new BadRequestException(
        'Branch ID is required to create a goods receipt',
      );
    }

    const itemsValue = body.items;
    const items: GoodsReceiptItemDto[] =
      typeof itemsValue === 'string'
        ? JSON.parse(itemsValue)
        : itemsValue;

    const dto: CreateGoodsReceiptDto = {
      supplierId: body.supplierId as string,
      receiptDate: body.receiptDate as string,
      grnNumber: (body.grnNumber as string | undefined) ?? undefined,
      items,
      taxPaid: body.taxPaid as boolean | undefined,
      paymentDueDateType: body.paymentDueDateType as 'one_month' | 'two_months' | 'six_months' | 'one_year' | 'other' | undefined,
      paymentDueDate: (body.paymentDueDate as string | undefined) ?? undefined,
    };

    return this.service.create(dto, file, userId, branchId);
  }

  @Get()
  @ApiOperation({
    summary: 'List goods receipts with pagination, search, and filtering',
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
    description: 'Search by GRN number',
  })
  @ApiQuery({
    name: 'supplierId',
    required: false,
    description: 'Filter by supplier UUID',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    description: 'Filter by branch UUID',
  })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    description: 'Sort order',
    enum: ['asc', 'desc'],
  })
  @ApiResponse({ status: 200, description: 'Paginated list of goods receipts' })
  findAll(@Query() query: GoodsReceiptsQueryDto) {
    return this.service.findAll({
      supplierId: query.supplierId,
      supplier: query.supplier,
      branchId: query.branchId,
      search: query.search,
      page: query.page!,
      limit: query.limit!,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get goods receipt by ID' })
  @ApiParam({ name: 'id', description: 'GRN UUID' })
  @ApiResponse({ status: 200, description: 'GRN details' })
  @ApiResponse({ status: 404, description: 'GRN not found' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @Roles('admin', 'store_keeper')
  @UseInterceptors(
    FileInterceptor('invoiceDocument', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Invoice file must be PDF, JPG, or PNG'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a goods receipt and its batch items' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'GRN UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        invoiceDocument: {
          type: 'string',
          format: 'binary',
          description: 'Optional new invoice file (PDF, JPG, PNG, max 10MB)',
        },
        receiptDate: { type: 'string', example: '2026-08-15' },
        taxPaid: { type: 'boolean' },
        paymentDueDateType: {
          type: 'string',
          enum: ['one_month', 'two_months', 'six_months', 'one_year', 'other'],
        },
        paymentDueDate: { type: 'string', format: 'date' },
        paymentMethod: {
          type: 'string',
          enum: ['cash', 'credit', 'mobile_bank'],
        },
        items: { type: 'string', description: 'JSON array of batch items to update. Each item must include batchId.' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'GRN updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'GRN not found' })
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser('sub') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('Current user identifier is required');
    }

    const itemsValue = body.items;
    const items = itemsValue
      ? typeof itemsValue === 'string'
        ? JSON.parse(itemsValue)
        : itemsValue
      : undefined;

    const dto: UpdateGoodsReceiptDto = {
      receiptDate: body.receiptDate as string | undefined,
      taxPaid: body.taxPaid as boolean | undefined,
      paymentDueDateType: body.paymentDueDateType as 'one_month' | 'two_months' | 'six_months' | 'one_year' | 'other' | undefined,
      paymentDueDate: body.paymentDueDate as string | undefined,
      paymentMethod: body.paymentMethod as 'cash' | 'credit' | 'mobile_bank' | undefined,
      items,
    };

    return this.service.update(id, dto, file, userId);
  }

  @Get(':id/invoice-url')
  @ApiOperation({ summary: 'Get signed URL for the invoice document' })
  @ApiParam({ name: 'id', description: 'GRN UUID' })
  @ApiResponse({ status: 200, description: 'Returns signed URL' })
  @ApiResponse({ status: 404, description: 'GRN or invoice not found' })
  async getInvoiceUrl(@Param('id') id: string) {
    const url = await this.service.getInvoiceUrl(id);
    return { url };
  }

  @Delete(':grnId/items/:batchId')
  @Roles('admin', 'store_keeper')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a specific item (batch) from a goods receipt' })
  @ApiParam({ name: 'grnId', description: 'GRN UUID' })
  @ApiParam({ name: 'batchId', description: 'Batch UUID to remove' })
  @ApiResponse({ status: 200, description: 'Item removed successfully' })
  @ApiResponse({ status: 400, description: 'Batch does not belong to this GRN' })
  @ApiResponse({ status: 404, description: 'GRN not found' })
  async removeItem(
    @Param('grnId') grnId: string,
    @Param('batchId') batchId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.removeItem(grnId, batchId, userId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a goods receipt' })
  @ApiParam({ name: 'id', description: 'GRN UUID' })
  @ApiResponse({ status: 200, description: 'GRN deleted successfully' })
  @ApiResponse({ status: 400, description: 'GRN has been sold or transferred' })
  @ApiResponse({ status: 404, description: 'GRN not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.remove(id, userId);
  }
}
