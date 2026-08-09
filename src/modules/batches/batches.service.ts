import { Injectable, NotFoundException } from '@nestjs/common';
import { BatchesRepository } from './batches.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { MinioService } from '../../common/storage/minio.service';
import { DatabaseService } from '../../db/database.service';
import { items, goodsReceipts, suppliers } from '../../db';
import { eq } from 'drizzle-orm';
import { PaginatedResponse } from '../../common/pagination';

@Injectable()
export class BatchesService {
  constructor(
    private readonly repository: BatchesRepository,
    private readonly stockMovementsService: StockMovementsService,
    private readonly minioService: MinioService,
    private readonly databaseService: DatabaseService,
  ) {}

  async findAll(params: {
    itemId?: string;
    expiringWithinDays?: number;
    search?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    return this.repository.findAll(params);
  }

  async findById(id: string) {
    const batch = await this.repository.findById(id);
    if (!batch) {
      throw new NotFoundException(`Batch ${id} not found`);
    }

    const itemResult = await this.databaseService.db
      .select()
      .from(items)
      .where(eq(items.id, batch.itemId))
      .limit(1);

    const grnResult = await this.databaseService.db
      .select({
        grn: goodsReceipts,
        supplierName: suppliers.name,
      })
      .from(goodsReceipts)
      .innerJoin(suppliers, eq(goodsReceipts.supplierId, suppliers.id))
      .where(eq(goodsReceipts.id, batch.grnId))
      .limit(1);

    const quantities =
      await this.stockMovementsService.getBatchQuantitiesByLocation(batch.id);

    return {
      ...batch,
      item: itemResult[0] || null,
      grn: grnResult[0]?.grn || null,
      supplierName: grnResult[0]?.supplierName || null,
      quantitiesByLocation: quantities,
    };
  }

  async getQrCodeUrl(id: string) {
    const batch = await this.repository.findById(id);
    if (!batch) {
      throw new NotFoundException(`Batch ${id} not found`);
    }
    if (!batch.qrCodeUrl) {
      throw new NotFoundException('No QR code available for this batch');
    }
    return this.minioService.getSignedUrl('batch-qr-codes', batch.qrCodeUrl);
  }
}
