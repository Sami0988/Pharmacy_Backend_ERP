import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { TraceabilityRepository } from './traceability.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { SupplierPaymentsService } from '../supplier-payments/supplier-payments.service';
import { MinioService } from '../../common/storage/minio.service';
import { DatabaseService } from '../../db/database.service';
import { locations } from '../../db';
import { eq } from 'drizzle-orm';

@Injectable()
export class TraceabilityService {
  private readonly logger = new Logger(TraceabilityService.name);

  constructor(
    private readonly repository: TraceabilityRepository,
    private readonly stockMovementsService: StockMovementsService,
    private readonly supplierPaymentsService: SupplierPaymentsService,
    private readonly minioService: MinioService,
    private readonly databaseService: DatabaseService,
  ) {}

  async traceByBatchNo(batchNo: string) {
    const trimmed = batchNo.trim();
    const batches = await this.repository.findByBatchNo(trimmed);
    if (batches.length === 0) {
      throw new NotFoundException(
        `No batches found matching "${trimmed}"`,
      );
    }
    return Promise.all(batches.map((b) => this.assembleTraceData(b)));
  }

  async traceByBatchId(batchId: string) {
    const batch = await this.repository.findById(batchId);
    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }
    return this.assembleTraceData(batch);
  }

  async getRecallImpact(batchId: string) {
    const batch = await this.repository.findById(batchId);
    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const [currentStock, salesHistory, totalSold] = await Promise.all([
      this.stockMovementsService.getBatchQuantitiesByLocation(batchId),
      this.buildSalesHistory(batchId),
      this.repository.getTotalSold(batchId),
    ]);

    return {
      batchId: batch.batchId,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      item: {
        id: batch.itemId,
        name: batch.itemName,
        genericName: batch.genericName,
      },
      currentStock: await this.buildCurrentStock(currentStock),
      totalSold,
      salesHistory,
      isExpired: this.isExpired(batch.expiryDate),
      daysUntilExpiry: this.daysUntilExpiry(batch.expiryDate),
    };
  }

  private async assembleTraceData(batchInfo: any) {
    const batchId = batchInfo.batchId;

    const [currentStock, totalSold, salesHistory, transferHistory, paymentStatus] =
      await Promise.all([
        this.stockMovementsService.getBatchQuantitiesByLocation(batchId),
        this.repository.getTotalSold(batchId),
        this.buildSalesHistory(batchId),
        this.buildTransferHistory(batchId),
        this.getPaymentStatus(batchInfo.grnId),
      ]);

    const invoiceDocumentSignedUrl = await this.getSignedUrl(
      batchInfo.invoiceDocumentUrl,
    );

    return {
      batchId: batchInfo.batchId,
      batchNo: batchInfo.batchNo,
      expiryDate: batchInfo.expiryDate,
      item: {
        id: batchInfo.itemId,
        name: batchInfo.itemName,
        genericName: batchInfo.genericName,
      },
      source: {
        supplier: {
          id: batchInfo.supplierId,
          name: batchInfo.supplierName,
          phone: batchInfo.supplierPhone,
          licenseNo: batchInfo.supplierLicenseNo,
        },
        grnId: batchInfo.grnId,
        grnNumber: batchInfo.grnNumber,
        receiptDate: batchInfo.receiptDate,
        invoiceDocumentSignedUrl,
        unitCost: batchInfo.unitCost,
        quantityReceived: batchInfo.quantityReceived,
        taxPaid: batchInfo.taxPaid,
        paymentDueDate: batchInfo.paymentDueDate,
        paymentDueDateType: batchInfo.paymentDueDateType,
      },
      paymentStatus,
      currentStock: await this.buildCurrentStock(currentStock),
      totalSold,
      salesHistory,
      transferHistory,
      isExpired: this.isExpired(batchInfo.expiryDate),
      daysUntilExpiry: this.daysUntilExpiry(batchInfo.expiryDate),
    };
  }

  private async buildSalesHistory(batchId: string) {
    const rawSales = await this.repository.getSalesHistory(batchId);
    const returns = await this.repository.getReturnsForBatch(batchId);

    const returnsBySaleItem = new Map<string, number>();
    for (const r of returns) {
      const current = returnsBySaleItem.get(r.saleItemId) ?? 0;
      returnsBySaleItem.set(r.saleItemId, current + r.quantityReturned);
    }

    return rawSales.map((s) => {
      const returned = returnsBySaleItem.get(s.saleItemId) ?? 0;
      return {
        saleId: s.saleId,
        saleDate: s.saleDate,
        quantitySold: Number(s.quantitySold) - returned,
        customerName: s.customerName,
        soldByUserName: s.soldByUserName,
      };
    });
  }

  private async buildCurrentStock(
    quantities: Array<{ locationId: string; quantity: number }>,
  ) {
    const results: Array<{ locationId: string; locationName: string; quantity: number }> = [];
    for (const q of quantities) {
      const locationName = await this.getLocationNameById(q.locationId);
      results.push({
        locationId: q.locationId,
        locationName: locationName ?? 'Unknown',
        quantity: q.quantity,
      });
    }
    return results;
  }

  private async buildTransferHistory(batchId: string) {
    const rawTransfers = await this.repository.getTransferHistory(batchId);
    return Promise.all(
      rawTransfers.map(async (t) => ({
        transferId: t.transferId,
        transferDate: t.transferDate,
        quantity: t.quantity,
        fromLocation: t.fromLocationName,
        toLocation: await this.getLocationNameById(t.toLocationId),
        transferredByUserName: t.transferredByUserName,
      })),
    );
  }

  private async getPaymentStatus(grnId: string) {
    try {
      const balance =
        await this.supplierPaymentsService['repository'].calculateGrnBalance(
          grnId,
        );
      return balance ?? { totalCost: 0, totalPaid: 0, outstanding: 0 };
    } catch (error) {
      this.logger.warn(
        `Failed to calculate payment status for GRN ${grnId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { totalCost: 0, totalPaid: 0, outstanding: 0 };
    }
  }

  private async getSignedUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return await this.minioService.getSignedUrl('invoices', key);
    } catch (error) {
      this.logger.warn(
        `Failed to generate signed URL for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async getLocationNameById(locationId: string): Promise<string | null> {
    const result = await this.databaseService.db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    return result[0]?.name ?? null;
  }

  private isExpired(expiryDate: string): boolean {
    const today = new Date().toISOString().split('T')[0];
    return expiryDate < today;
  }

  private daysUntilExpiry(expiryDate: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate + 'T00:00:00');
    const diffMs = expiry.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }
}
