import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { BatchesRepository } from './batches.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { MinioService } from '../../common/storage/minio.service';
import { DatabaseService } from '../../db/database.service';
import { items, goodsReceipts, suppliers, saleItems, transfers, stockMovements, locations } from '../../db';
import { eq, sql } from 'drizzle-orm';
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

    const quantitiesWithPacks = quantities.map((q) => ({
      ...q,
      packSize: q.packSize ?? 1,
      numberOfPacks: Math.floor(q.quantity / (q.packSize ?? 1)),
    }));

    return {
      ...batch,
      item: itemResult[0] || null,
      grn: grnResult[0]?.grn || null,
      supplierName: grnResult[0]?.supplierName || null,
      quantitiesByLocation: quantitiesWithPacks,
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

  async updateBatchPack(id: string, dto: {
    numberOfPacks?: number;
    locationId?: string;
    packSize?: number;
    unitCost?: number;
    sellingPrice?: number;
    packPrice?: number;
  }, userId: string) {
    const batch = await this.repository.findById(id);
    if (!batch) {
      throw new NotFoundException(`Batch ${id} not found`);
    }

    const newPackSize = dto.packSize ?? batch.packSize;

    const newUnitCost = dto.unitCost !== undefined
      ? dto.unitCost / newPackSize
      : Number(batch.unitCost);

    const newSellingPrice = dto.sellingPrice ?? Number(batch.sellingPrice);
    if (newSellingPrice < newUnitCost) {
      throw new BadRequestException(
        `Selling price (${newSellingPrice}) cannot be less than unit cost (${newUnitCost})`,
      );
    }

    if (dto.locationId && dto.numberOfPacks !== undefined) {
      const targetUnits = dto.numberOfPacks * newPackSize;

      const currentQtyAtLocation = await this.stockMovementsService.getCurrentQuantity(
        id,
        dto.locationId,
      );

      const delta = targetUnits - currentQtyAtLocation;

      if (delta !== 0) {
        await this.stockMovementsService.record({
          batchId: id,
          locationId: dto.locationId,
          type: 'adjustment',
          quantity: delta,
          refType: 'batch_update',
          createdBy: userId,
        });
      }

      const stockResult = await this.databaseService.db
        .select({ total: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)` })
        .from(stockMovements)
        .where(eq(stockMovements.batchId, id));

      const newTotalUnits = Number(stockResult[0]?.total ?? 0);

      const updated = await this.repository.update(id, {
        packSize: dto.packSize,
        quantityReceived: newTotalUnits,
        unitCost: dto.unitCost !== undefined ? newUnitCost : undefined,
        sellingPrice: dto.sellingPrice !== undefined ? newSellingPrice : undefined,
        packPrice: dto.packPrice != null ? String(dto.packPrice) : undefined,
      });

      return updated;
    }

    const newNumberOfPacks = dto.numberOfPacks ?? (batch.quantityReceived / batch.packSize);
    const newTotalUnits = newNumberOfPacks * newPackSize;

    if (newTotalUnits < batch.quantityReceived) {
      const soldResult = await this.databaseService.db
        .select({ total: sql<number>`COALESCE(SUM(${saleItems.quantity}), 0)` })
        .from(saleItems)
        .where(eq(saleItems.batchId, id));
      const soldQty = Number(soldResult[0]?.total ?? 0);

      const transferResult = await this.databaseService.db
        .select({ total: sql<number>`COALESCE(SUM(${transfers.quantity}), 0)` })
        .from(transfers)
        .where(eq(transfers.batchId, id));
      const transferredQty = Number(transferResult[0]?.total ?? 0);

      const consumedQty = soldQty + transferredQty;
      if (newTotalUnits < consumedQty) {
        throw new BadRequestException(
          `Cannot reduce to ${newTotalUnits} units: ${consumedQty} already consumed (${soldQty} sold, ${transferredQty} transferred)`,
        );
      }
    }

    const updated = await this.repository.update(id, {
      packSize: dto.packSize,
      quantityReceived: newTotalUnits,
      unitCost: dto.unitCost !== undefined ? newUnitCost : undefined,
      sellingPrice: dto.sellingPrice !== undefined ? newSellingPrice : undefined,
      packPrice: dto.packPrice != null ? String(dto.packPrice) : undefined,
    });

    const stockResult = await this.databaseService.db
      .select({ locationId: stockMovements.locationId, total: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)` })
      .from(stockMovements)
      .where(eq(stockMovements.batchId, id))
      .groupBy(stockMovements.locationId);

    const currentStock = stockResult.reduce((sum, r) => sum + Number(r.total), 0);
    const stockDelta = newTotalUnits - currentStock;

    if (stockDelta !== 0) {
      const storeLoc = stockResult.length > 0
        ? stockResult.reduce((a, b) => Number(a.total) >= Number(b.total) ? a : b).locationId
        : null;

      if (storeLoc) {
        await this.stockMovementsService.record({
          batchId: id,
          locationId: storeLoc,
          type: 'adjustment',
          quantity: stockDelta,
          refType: 'batch_update',
          createdBy: userId,
        });
      } else {
        const [defaultLoc] = await this.databaseService.db
          .select({ id: locations.id })
          .from(locations)
          .where(eq(locations.name, 'Store'))
          .limit(1);

        if (defaultLoc) {
          await this.stockMovementsService.record({
            batchId: id,
            locationId: defaultLoc.id,
            type: 'adjustment',
            quantity: stockDelta,
            refType: 'batch_update',
            createdBy: userId,
          });
        }
      }
    }

    return updated;
  }
}
