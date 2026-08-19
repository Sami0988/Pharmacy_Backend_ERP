import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ExportJobData } from './export-job.service';
import { PdfExportService } from './pdf-export.service';
import { MinioService } from '../storage/minio.service';
import { DatabaseService } from '../../db/database.service';
import { ReportsRepository } from '../../modules/reports/reports.repository';

@Processor('export-jobs')
export class ExportJobProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportJobProcessor.name);

  constructor(
    private readonly pdfExportService: PdfExportService,
    private readonly minioService: MinioService,
    private readonly databaseService: DatabaseService,
    private readonly reportsRepository: ReportsRepository,
  ) {
    super();
  }

  async process(job: Job<ExportJobData>): Promise<{ result: { fileUrl: string; fileName: string } }> {
    const { jobId, type, format, params } = job.data;

    this.logger.log(`Processing export job: ${jobId} (${type}, ${format})`);

    try {
      const result = await this.getReportData(type, params);
      const fileName = `${type}-report-${jobId}`;
      let fileUrl: string;

      if (format === 'pdf') {
        const title = `${type} Report`;
        const pdfBuffer = await this.pdfExportService.generatePdfFromData(
          title,
          result.columns,
          result.rows,
        );
        await this.minioService.uploadFile(
          'reports',
          `${fileName}.pdf`,
          pdfBuffer,
          'application/pdf',
        );
        fileUrl = `${fileName}.pdf`;
      } else {
        // CSV
        const csvContent = this.generateCsv(result.columns, result.rows);
        await this.minioService.uploadFile(
          'reports',
          `${fileName}.csv`,
          Buffer.from(csvContent),
          'text/csv',
        );
        fileUrl = `${fileName}.csv`;
      }

      this.logger.log(`Export job completed: ${jobId}`);
      return { result: { fileUrl, fileName: `${fileName}.${format}` } };
    } catch (error) {
      this.logger.error(`Export job failed: ${jobId}`, error);
      throw error;
    }
  }

  private async getReportData(type: ExportJobData['type'], params: Record<string, unknown>): Promise<{ columns: string[]; rows: string[][] }> {
    let data: unknown[];

    switch (type) {
      case 'stock':
        data = await this.reportsRepository.getStockReportRaw();
        return {
          columns: ['Item ID', 'Item Name', 'Pack Size', 'Store Qty (Units)', 'Store Packs', 'Dispatcher Qty (Units)', 'Dispatcher Packs', 'Total Qty (Units)', 'Total Packs', 'Total Value'],
          rows: data.map((item: Record<string, unknown>) => [
            String(item.itemId ?? ''),
            String(item.itemName ?? ''),
            String(item.packSize ?? 1),
            String(item.storeQuantity ?? 0),
            String(item.storePacks ?? 0),
            String(item.dispatcherQuantity ?? 0),
            String(item.dispatcherPacks ?? 0),
            String(item.totalQuantity ?? 0),
            String(item.totalPacks ?? 0),
            String(item.totalValueAtCost ?? 0),
          ]),
        };
      case 'expiry':
        {
          const expiryResult = await this.reportsRepository.getExpiryReport(
            params.withinDays as number | undefined,
          );
          data = expiryResult.data;
        }
        return {
          columns: ['Batch No', 'Item Name', 'Expiry Date', 'Qty', 'Is Expired'],
          rows: data.map((item: Record<string, unknown>) => [
            String(item.batchNo ?? ''),
            String(item.itemName ?? ''),
            String(item.expiryDate ?? ''),
            String(item.quantity ?? 0),
            String(item.isExpired ?? false),
          ]),
        };
      case 'sales':
        {
          const salesResult = await this.reportsRepository.getSalesReport(
            params.startDate as string | undefined,
            params.endDate as string | undefined,
          );
          data = salesResult.data;
        }
        return {
          columns: ['Sale ID', 'Item', 'Qty', 'Unit Price', 'Total', 'Payment', 'Cashier', 'Date'],
          rows: data.map((item: Record<string, unknown>) => [
            String(item.saleId ?? ''),
            String(item.itemName ?? ''),
            String(item.quantity ?? 0),
            String(item.unitPrice ?? 0),
            String(item.totalAmount ?? 0),
            String(item.paymentMethod ?? ''),
            String(item.soldByName ?? ''),
            String(item.saleDate ?? ''),
          ]),
        };
      case 'supplier-balance':
        data = await this.reportsRepository.getSupplierBalanceReport();
        return {
          columns: ['Supplier', 'Total Cost', 'Total Paid', 'Outstanding'],
          rows: data.map((item: Record<string, unknown>) => [
            String(item.supplierName ?? ''),
            String(item.totalCost ?? 0),
            String(item.totalPaid ?? 0),
            String(item.outstanding ?? 0),
          ]),
        };
      default:
        throw new Error(`Unknown report type: ${type}`);
    }
  }

  private generateCsv(columns: string[], rows: string[][]): string {
    const headers = columns.join(',');
    const csvRows = rows.map((row) =>
      row.map((value) => {
        // Escape CSV values
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    );
    return [headers, ...csvRows].join('\n');
  }
}
