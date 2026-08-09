import {
  Controller,
  Post,
  Get,
  Param,
  Body,
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
  ApiBody,
} from '@nestjs/swagger';
import { SupplierPaymentsService } from './supplier-payments.service';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { PaginationQueryDto } from '../../common/pagination';

@ApiTags('Supplier Payments')
@Controller()
export class SupplierPaymentsController {
  constructor(private readonly service: SupplierPaymentsService) {}

  @Post('supplier-payments')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Record a supplier payment against a GRN' })
  @ApiBody({ type: CreateSupplierPaymentDto })
  @ApiResponse({
    status: 201,
    description: 'Payment recorded with updated outstanding balance',
  })
  @ApiResponse({ status: 400, description: 'Overpayment or GRN fully paid' })
  @ApiResponse({ status: 404, description: 'GRN not found' })
  create(
    @Body() dto: CreateSupplierPaymentDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Get('goods-receipts/:id/payments')
  @ApiOperation({ summary: 'Get all payments for a specific GRN' })
  @ApiParam({ name: 'id', description: 'GRN UUID' })
  @ApiResponse({
    status: 200,
    description: 'Returns payments list and balance summary',
  })
  getGrnPayments(@Param('id') grnId: string) {
    return this.service.getGrnPayments(grnId);
  }

  @Get('suppliers/balances')
  @Roles('admin')
  @ApiOperation({ summary: 'Get all suppliers with outstanding balances' })
  @ApiResponse({
    status: 200,
    description: 'List of suppliers with total cost, paid, and outstanding',
  })
  getAllSuppliersWithOutstanding() {
    return this.service.getAllSuppliersWithOutstanding();
  }

  @Get('suppliers/:id/balance')
  @ApiOperation({ summary: 'Get balance summary for a specific supplier' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  @ApiResponse({
    status: 200,
    description: 'Returns total cost, total paid, and outstanding balance',
  })
  getSupplierBalance(@Param('id') supplierId: string) {
    return this.service.getSupplierBalance(supplierId);
  }

  @Get('suppliers/:id/payments')
  @ApiOperation({ summary: 'Get payment history for a supplier' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order', enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of payments' })
  getSupplierPayments(
    @Param('id') supplierId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.getSupplierPayments(supplierId, {
      page: query.page!,
      limit: query.limit!,
    });
  }
}
