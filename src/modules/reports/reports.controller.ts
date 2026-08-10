import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { PdfExportService } from '../../common/export/pdf-export.service';
import { arrayToCsv, sendCsv } from '../../common/export/csv-export.util';
import { PaginationQueryDto } from '../../common/pagination';

@ApiTags('Reports')
@ApiBearerAuth('jwt-access')
@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);
  constructor(
    private readonly reportsService: ReportsService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  private async sendExport(res: Response, filename: string, result: any, format: string) {
    if (format === 'csv') {
      return sendCsv(res, `${filename}.csv`, arrayToCsv(result.data, result.columns));
    }
    if (format === 'pdf') {
      const title = filename.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      const headers = result.columns.map((c: any) => c.header);
      const rows = result.data.map((row: any) => result.columns.map((c: any) => String(row[c.key] ?? '')));
      const pdf = await this.pdfExportService.generatePdfFromData(title, headers, rows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      return res.send(pdf);
    }
    return result;
  }

  @Get('stock')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Stock report by location' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'format', required: false })
  async getStock(
    @Query() pagination: PaginationQueryDto,
    @Query('format') format?: string,
    @Query('search') search?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    this.logger.debug(`[Reports] GET /reports/stock - page: ${pagination.page}, limit: ${pagination.limit}, format: ${format}`);
    const result = await this.reportsService.getStockReport(
      { page: pagination.page!, limit: pagination.limit! },
      format,
      search,
    );
    this.logger.debug(`[Reports] GET /reports/stock - returned successfully`);
    if (format && res) return this.sendExport(res, 'stock-report', result, format);
    return result;
  }

  @Get('stock/batches')
  @ApiOperation({ summary: 'Stock by batch for POS (Dispatcher location)' })
  @ApiQuery({ name: 'itemId', required: false, description: 'Filter by item ID' })
  @ApiResponse({ status: 200, description: 'List of batches with stock at Dispatcher' })
  async getStockByBatch(@Query('itemId') itemId?: string) {
    return this.reportsService.getStockByBatch(itemId);
  }

  @Get('expiry')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Expiry report' })
  @ApiQuery({ name: 'withinDays', required: false })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'format', required: false })
  async getExpiry(
    @Query('withinDays') withinDays?: string,
    @Query() pagination?: PaginationQueryDto,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const days = withinDays ? parseInt(withinDays, 10) : 90;
    const result = await this.reportsService.getExpiryReport(
      Number.isFinite(days) && days > 0 ? days : undefined,
      format,
      pagination ? { page: pagination.page!, limit: pagination.limit! } : undefined,
    );
    if (format && res) return this.sendExport(res, 'expiry-report', result, format);
    return result;
  }

  @Get('sales')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Sales report' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'format', required: false })
  async getSales(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query() pagination?: PaginationQueryDto,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.reportsService.getSalesReport(
      startDate,
      endDate,
      format,
      pagination ? { page: pagination.page!, limit: pagination.limit! } : undefined,
    );
    if (format && res) return this.sendExport(res, 'sales-report', result, format);
    return result;
  }

  @Get('supplier-balance')
  @Roles('admin')
  @ApiOperation({ summary: 'Supplier balance report' })
  @ApiQuery({ name: 'format', required: false })
  async getSupplierBalance(@Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const result = await this.reportsService.getSupplierBalanceReport(format);
    if (format && res) return this.sendExport(res, 'supplier-balance-report', result, format);
    return result;
  }

  @Get('dead-stock')
  @Roles('admin')
  @ApiOperation({ summary: 'Dead-stock report' })
  @ApiQuery({ name: 'daysThreshold', required: false })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'format', required: false })
  async getDeadStock(
    @Query('daysThreshold') daysThreshold?: string,
    @Query() pagination?: PaginationQueryDto,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const days = daysThreshold ? parseInt(daysThreshold, 10) : 60;
    const result = await this.reportsService.getDeadStockReport(
      Number.isFinite(days) && days > 0 ? days : undefined,
      format,
      pagination ? { page: pagination.page!, limit: pagination.limit! } : undefined,
    );
    if (format && res) return this.sendExport(res, 'dead-stock-report', result, format);
    return result;
  }
}
