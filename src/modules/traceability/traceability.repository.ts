import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import {
  batches,
  items,
  goodsReceipts,
  suppliers,
  stockMovements,
  saleItems,
  sales,
  saleReturns,
  customers,
  users,
  transfers,
  locations,
} from '../../db';
import { eq, and, sql, ilike, desc } from 'drizzle-orm';

@Injectable()
export class TraceabilityRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByBatchNo(batchNo: string) {
    return this.databaseService.db
      .select({
        batchId: batches.id,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        unitCost: batches.unitCost,
        quantityReceived: batches.quantityReceived,
        itemId: items.id,
        itemName: items.name,
        genericName: items.genericName,
        grnId: goodsReceipts.id,
        grnNumber: goodsReceipts.grnNumber,
        receiptDate: goodsReceipts.receiptDate,
        invoiceDocumentUrl: goodsReceipts.invoiceDocumentUrl,
        totalCost: goodsReceipts.totalCost,
        taxPaid: goodsReceipts.taxPaid,
        paymentDueDate: goodsReceipts.paymentDueDate,
        paymentDueDateType: goodsReceipts.paymentDueDateType,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        supplierPhone: suppliers.phone,
        supplierLicenseNo: suppliers.licenseNo,
      })
      .from(batches)
      .innerJoin(items, eq(batches.itemId, items.id))
      .innerJoin(goodsReceipts, eq(batches.grnId, goodsReceipts.id))
      .innerJoin(suppliers, eq(goodsReceipts.supplierId, suppliers.id))
      .where(ilike(batches.batchNo, batchNo.trim()))
      .orderBy(desc(goodsReceipts.receiptDate));
  }

  async findById(batchId: string) {
    const result = await this.databaseService.db
      .select({
        batchId: batches.id,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        unitCost: batches.unitCost,
        quantityReceived: batches.quantityReceived,
        itemId: items.id,
        itemName: items.name,
        genericName: items.genericName,
        grnId: goodsReceipts.id,
        grnNumber: goodsReceipts.grnNumber,
        receiptDate: goodsReceipts.receiptDate,
        invoiceDocumentUrl: goodsReceipts.invoiceDocumentUrl,
        totalCost: goodsReceipts.totalCost,
        taxPaid: goodsReceipts.taxPaid,
        paymentDueDate: goodsReceipts.paymentDueDate,
        paymentDueDateType: goodsReceipts.paymentDueDateType,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        supplierPhone: suppliers.phone,
        supplierLicenseNo: suppliers.licenseNo,
      })
      .from(batches)
      .innerJoin(items, eq(batches.itemId, items.id))
      .innerJoin(goodsReceipts, eq(batches.grnId, goodsReceipts.id))
      .innerJoin(suppliers, eq(goodsReceipts.supplierId, suppliers.id))
      .where(eq(batches.id, batchId))
      .limit(1);

    return result[0] ?? null;
  }

  async getSalesHistory(batchId: string) {
    return this.databaseService.db
      .select({
        saleId: sales.id,
        saleDate: sales.createdAt,
        quantitySold: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        customerName: customers.name,
        soldByUserName: users.name,
        saleItemId: saleItems.id,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(users, eq(sales.soldBy, users.id))
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(eq(saleItems.batchId, batchId))
      .orderBy(desc(sales.createdAt));
  }

  async getReturnsForBatch(batchId: string) {
    return this.databaseService.db
      .select({
        saleItemId: saleReturns.saleItemId,
        quantityReturned: saleReturns.quantity,
      })
      .from(saleReturns)
      .innerJoin(saleItems, eq(saleReturns.saleItemId, saleItems.id))
      .where(eq(saleItems.batchId, batchId));
  }

  async getTotalSold(batchId: string) {
    const soldResult = await this.databaseService.db
      .select({
        total: sql<number>`coalesce(sum(${saleItems.quantity}), 0)`,
      })
      .from(saleItems)
      .where(eq(saleItems.batchId, batchId));

    const returnedResult = await this.databaseService.db
      .select({
        total: sql<number>`coalesce(sum(${saleReturns.quantity}), 0)`,
      })
      .from(saleReturns)
      .innerJoin(saleItems, eq(saleReturns.saleItemId, saleItems.id))
      .where(eq(saleItems.batchId, batchId));

    return Number(soldResult[0]?.total ?? 0) - Number(returnedResult[0]?.total ?? 0);
  }

  async getTransferHistory(batchId: string) {
    return this.databaseService.db
      .select({
        transferId: transfers.id,
        transferDate: transfers.createdAt,
        quantity: transfers.quantity,
        fromLocationName: locations.name,
        toLocationId: transfers.toLocationId,
        transferredByUserName: users.name,
      })
      .from(transfers)
      .innerJoin(users, eq(transfers.transferredBy, users.id))
      .innerJoin(locations, eq(transfers.fromLocationId, locations.id))
      .where(eq(transfers.batchId, batchId))
      .orderBy(desc(transfers.createdAt));
  }
}
