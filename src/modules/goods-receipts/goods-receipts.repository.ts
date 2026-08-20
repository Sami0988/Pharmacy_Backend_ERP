import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { goodsReceipts, suppliers, branches, batches, items, supplierPayments, stockMovements, saleItems, transfers } from '../../db';
import { eq, and, or, sql, SQL, count, desc, asc } from 'drizzle-orm';
import { paginate, PaginatedResponse } from '../../common/pagination';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class GoodsReceiptsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(params: {
    supplierId?: string;
    supplier?: string;
    branchId?: string;
    search?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const conditions: SQL[] = [];
    if (params.supplierId) {
      conditions.push(eq(goodsReceipts.supplierId, params.supplierId));
    }
    if (params.supplier) {
      if (UUID_REGEX.test(params.supplier)) {
        conditions.push(eq(goodsReceipts.supplierId, params.supplier));
      } else {
        conditions.push(
          sql`${goodsReceipts.supplierId} IN (SELECT ${suppliers.id} FROM ${suppliers} WHERE ${suppliers.name} ILIKE ${'%' + params.supplier + '%'})`,
        );
      }
    }
    if (params.branchId) {
      if (UUID_REGEX.test(params.branchId)) {
        conditions.push(eq(goodsReceipts.branchId, params.branchId));
      } else {
        conditions.push(
          sql`${goodsReceipts.branchId} IN (SELECT ${branches.id} FROM ${branches} WHERE ${branches.name} ILIKE ${'%' + params.branchId + '%'})`,
        );
      }
    }
    if (params.search) {
      conditions.push(
        sql`${goodsReceipts.grnNumber} ILIKE ${`%${params.search}%`}`,
      );
    }

    const whereClause =
      conditions.length > 0
        ? conditions.length === 1
          ? conditions[0]
          : and(...conditions)
        : undefined;

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(goodsReceipts)
      .where(whereClause);

    const ALLOWED_SORT_FIELDS: Record<string, any> = {
      grnNumber: goodsReceipts.grnNumber,
      createdAt: goodsReceipts.createdAt,
      receiptDate: goodsReceipts.receiptDate,
      totalCost: goodsReceipts.totalCost,
    };

    const col = params.sortBy ? ALLOWED_SORT_FIELDS[params.sortBy] : undefined;
    const orderCol = col || goodsReceipts.createdAt;

    const baseQuery = this.databaseService.db
      .select({
        id: goodsReceipts.id,
        grnNumber: goodsReceipts.grnNumber,
        receiptDate: goodsReceipts.receiptDate,
        totalCost: goodsReceipts.totalCost,
        invoiceDocumentUrl: goodsReceipts.invoiceDocumentUrl,
        taxPaid: goodsReceipts.taxPaid,
        paymentDueDate: goodsReceipts.paymentDueDate,
        paymentDueDateType: goodsReceipts.paymentDueDateType,
        paymentMethod: goodsReceipts.paymentMethod,
        createdAt: goodsReceipts.createdAt,
        supplierId: goodsReceipts.supplierId,
        supplierName: suppliers.name,
        branchId: goodsReceipts.branchId,
        branchName: branches.name,
        createdBy: goodsReceipts.createdBy,
        batchCount: count(batches.id),
        amountPaid: sql<string>`COALESCE(SUM(${supplierPayments.amountPaid}), 0)`,
      })
      .from(goodsReceipts)
      .leftJoin(suppliers, eq(goodsReceipts.supplierId, suppliers.id))
      .leftJoin(branches, eq(goodsReceipts.branchId, branches.id))
      .leftJoin(batches, eq(goodsReceipts.id, batches.grnId))
      .leftJoin(supplierPayments, eq(goodsReceipts.id, supplierPayments.grnId))
      .where(whereClause)
      .groupBy(
        goodsReceipts.id,
        goodsReceipts.grnNumber,
        goodsReceipts.receiptDate,
        goodsReceipts.totalCost,
        goodsReceipts.invoiceDocumentUrl,
        goodsReceipts.createdAt,
        goodsReceipts.supplierId,
        suppliers.name,
        goodsReceipts.branchId,
        branches.name,
        goodsReceipts.createdBy,
        goodsReceipts.paymentMethod,
      )
      .orderBy(params.sortOrder === 'asc' ? asc(orderCol) : desc(orderCol));

    return paginate<any>({
      db: this.databaseService.db,
      baseQuery,
      countQuery,
      page: params.page,
      limit: params.limit,
    });
  }

  async findById(id: string) {
    const result = await this.databaseService.db
      .select({
        id: goodsReceipts.id,
        grnNumber: goodsReceipts.grnNumber,
        receiptDate: goodsReceipts.receiptDate,
        totalCost: goodsReceipts.totalCost,
        invoiceDocumentUrl: goodsReceipts.invoiceDocumentUrl,
        taxPaid: goodsReceipts.taxPaid,
        paymentDueDate: goodsReceipts.paymentDueDate,
        paymentDueDateType: goodsReceipts.paymentDueDateType,
        paymentMethod: goodsReceipts.paymentMethod,
        createdAt: goodsReceipts.createdAt,
        supplierId: goodsReceipts.supplierId,
        supplierName: suppliers.name,
        supplierPhone: suppliers.phone,
        branchId: goodsReceipts.branchId,
        branchName: branches.name,
        createdBy: goodsReceipts.createdBy,
      })
      .from(goodsReceipts)
      .leftJoin(suppliers, eq(goodsReceipts.supplierId, suppliers.id))
      .leftJoin(branches, eq(goodsReceipts.branchId, branches.id))
      .where(eq(goodsReceipts.id, id))
      .limit(1);

    if (!result[0]) return null;

    const grnBatches = await this.databaseService.db
      .select({
        id: batches.id,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        packSize: batches.packSize,
        unitCost: batches.unitCost,
        sellingPrice: batches.sellingPrice,
        quantityReceived: batches.quantityReceived,
        itemId: batches.itemId,
        itemName: items.name,
      })
      .from(batches)
      .leftJoin(items, eq(batches.itemId, items.id))
      .where(eq(batches.grnId, id));

    return { ...result[0], items: grnBatches };
  }

  async findByGrnNumberAndSupplier(
    grnNumber: string,
    supplierId: string,
  ): Promise<boolean> {
    const result = await this.databaseService.db
      .select({ id: goodsReceipts.id })
      .from(goodsReceipts)
      .where(
        and(
          eq(goodsReceipts.grnNumber, grnNumber),
          eq(goodsReceipts.supplierId, supplierId),
        ),
      )
      .limit(1);
    return result.length > 0;
  }

  async create(data: {
    supplierId: string;
    branchId: string;
    grnNumber: string;
    receiptDate: string;
    invoiceDocumentUrl?: string;
    totalCost: number;
    createdBy: string;
  }) {
    const [row] = await this.databaseService.db
      .insert(goodsReceipts)
      .values({
        ...data,
        totalCost: String(data.totalCost),
      })
      .returning();
    return row;
  }

  async hardDelete(id: string) {
    const grn = await this.databaseService.db
      .select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.id, id))
      .limit(1);

    if (!grn[0]) return null;

    const grnBatches = await this.databaseService.db
      .select({ id: batches.id })
      .from(batches)
      .where(eq(batches.grnId, id));

    if (grnBatches.length > 0) {
      const batchIds = grnBatches.map((b) => b.id);

      const soldItems = await this.databaseService.db
        .select({ id: saleItems.id })
        .from(saleItems)
        .where(sql`${saleItems.batchId} IN ${batchIds}`)
        .limit(1);

      if (soldItems.length > 0) {
        throw new BadRequestException(
          'Cannot delete GRN: some batches have been sold. Reverse the sales first.',
        );
      }

    }

    return this.databaseService.db.transaction(async (tx) => {
      // Reverse transfers: create reverse stock movements and delete transfer records
      for (const batch of grnBatches) {
        const batchTransfers = await tx
          .select()
          .from(transfers)
          .where(eq(transfers.batchId, batch.id));

        for (const transfer of batchTransfers) {
          // Add stock back to the source location (reverse transfer_out)
          await tx.insert(stockMovements).values({
            batchId: transfer.batchId,
            locationId: transfer.fromLocationId,
            type: 'transfer_in',
            quantity: transfer.quantity,
            refId: transfer.id,
            refType: 'transfer',
            createdBy: transfer.transferredBy,
          });

          // Remove stock from the destination location (reverse transfer_in)
          await tx.insert(stockMovements).values({
            batchId: transfer.batchId,
            locationId: transfer.toLocationId,
            type: 'transfer_out',
            quantity: -transfer.quantity,
            refId: transfer.id,
            refType: 'transfer',
            createdBy: transfer.transferredBy,
          });
        }

        // Delete the transfer records
        if (batchTransfers.length > 0) {
          await tx
            .delete(transfers)
            .where(eq(transfers.batchId, batch.id));
        }
      }

      await tx
        .delete(supplierPayments)
        .where(eq(supplierPayments.grnId, id));

      for (const batch of grnBatches) {
        await tx
          .delete(stockMovements)
          .where(eq(stockMovements.batchId, batch.id));
      }

      await tx
        .delete(batches)
        .where(eq(batches.grnId, id));

      const [deleted] = await tx
        .delete(goodsReceipts)
        .where(eq(goodsReceipts.id, id))
        .returning();

      return deleted;
    });
  }

  async updateGrn(id: string, data: {
    receiptDate?: string;
    taxPaid?: boolean;
    paymentDueDateType?: string;
    paymentDueDate?: string;
    paymentMethod?: string;
    totalCost?: number;
    invoiceDocumentUrl?: string;
  }) {
    const updateData: Record<string, any> = {};
    if (data.receiptDate !== undefined) updateData.receiptDate = data.receiptDate;
    if (data.taxPaid !== undefined) updateData.taxPaid = data.taxPaid;
    if (data.paymentDueDateType !== undefined) updateData.paymentDueDateType = data.paymentDueDateType;
    if (data.paymentDueDate !== undefined) updateData.paymentDueDate = data.paymentDueDate;
    if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
    if (data.totalCost !== undefined) updateData.totalCost = String(data.totalCost);
    if (data.invoiceDocumentUrl !== undefined) updateData.invoiceDocumentUrl = data.invoiceDocumentUrl;

    if (Object.keys(updateData).length === 0) return null;

    const [updated] = await this.databaseService.db
      .update(goodsReceipts)
      .set(updateData)
      .where(eq(goodsReceipts.id, id))
      .returning();
    return updated;
  }

  async getBatchesByGrnId(grnId: string) {
    return this.databaseService.db
      .select()
      .from(batches)
      .where(eq(batches.grnId, grnId));
  }

  async getSoldQuantityForBatch(batchId: string): Promise<number> {
    const result = await this.databaseService.db
      .select({
        total: sql<number>`coalesce(sum(${saleItems.quantity}), 0)`,
      })
      .from(saleItems)
      .where(eq(saleItems.batchId, batchId));
    return Number(result[0]?.total ?? 0);
  }

  async getTransferredQuantityForBatch(batchId: string): Promise<number> {
    const result = await this.databaseService.db
      .select({
        total: sql<number>`coalesce(sum(${transfers.quantity}), 0)`,
      })
      .from(transfers)
      .where(eq(transfers.batchId, batchId));
    return Number(result[0]?.total ?? 0);
  }

  async removeItemFromGrn(grnId: string, batchId: string) {
    const grn = await this.databaseService.db
      .select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.id, grnId))
      .limit(1);

    if (!grn[0]) return { error: 'GRN_NOT_FOUND' as const };

    const batch = await this.databaseService.db
      .select()
      .from(batches)
      .where(and(eq(batches.id, batchId), eq(batches.grnId, grnId)))
      .limit(1);

    if (!batch[0]) return { error: 'BATCH_NOT_FOUND' as const };

    const warnings: string[] = [];

    const saleCount = await this.databaseService.db
      .select({ count: count() })
      .from(saleItems)
      .where(eq(saleItems.batchId, batchId));

    if (saleCount[0].count > 0) {
      warnings.push(`This batch has ${saleCount[0].count} sale(s) — stock may be affected`);
    }

    const transferCount = await this.databaseService.db
      .select({ count: count() })
      .from(transfers)
      .where(eq(transfers.batchId, batchId));

    if (transferCount[0].count > 0) {
      warnings.push(`This batch has ${transferCount[0].count} transfer(s) — stock may be affected`);
    }

    const otherMovements = await this.databaseService.db
      .select({ count: count() })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.batchId, batchId),
          sql`${stockMovements.type} != 'receipt'`,
        ),
      );

    if (otherMovements[0].count > 0) {
      warnings.push(`This batch has ${otherMovements[0].count} non-receipt stock movement(s) — stock may be affected`);
    }

    const previousTotalCost = Number(grn[0].totalCost);
    const batchCost = batch[0].quantityReceived * Number(batch[0].unitCost);

    const deletedMovement = await this.databaseService.db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(stockMovements)
        .where(
          and(
            eq(stockMovements.batchId, batchId),
            eq(stockMovements.type, 'receipt'),
          ),
        )
        .returning();

      await tx
        .delete(batches)
        .where(eq(batches.id, batchId));

      const newTotalCost = previousTotalCost - batchCost;
      await tx
        .update(goodsReceipts)
        .set({ totalCost: String(newTotalCost) })
        .where(eq(goodsReceipts.id, grnId));

      return deleted;
    });

    return {
      movement: deletedMovement ?? null,
      batch: batch[0],
      previousTotalCost,
      newTotalCost: previousTotalCost - batchCost,
      warnings,
    };
  }

  async getReceiptStockMovement(batchId: string) {
    const result = await this.databaseService.db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.batchId, batchId),
          eq(stockMovements.type, 'receipt'),
        )
      )
      .limit(1);
    return result[0] || null;
  }
}
