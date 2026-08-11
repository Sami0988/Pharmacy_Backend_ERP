import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DatabaseService } from '../../db/database.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { StockMovementsService } from '../../modules/stock-movements/stock-movements.service';
import { items, batches, stockMovements, locations, goodsReceipts, suppliers } from '../../db';
import { eq, and, sql, lt, gte } from 'drizzle-orm';

@Processor('stock-alerts', { concurrency: 1 })
export class StockAlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(StockAlertsProcessor.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly notificationsService: NotificationsService,
    private readonly stockMovementsService: StockMovementsService,
  ) {
    super();
  }

  async process(job: Job) {
    this.logger.log('Starting stock alerts check...');

    const results = {
      zeroStock: 0,
      lowStock: 0,
      nearExpiry: 0,
      expired: 0,
      paymentDue: 0,
      paymentOverdue: 0,
    };

    try { await this.checkZeroDispatcherStock(results); } catch (e) { this.logger.error(`Zero stock check failed: ${e instanceof Error ? e.message : String(e)}`); }
    try { await this.checkLowStoreStock(results); } catch (e) { this.logger.error(`Low stock check failed: ${e instanceof Error ? e.message : String(e)}`); }
    try { await this.checkNearExpiryBatches(results); } catch (e) { this.logger.error(`Near expiry check failed: ${e instanceof Error ? e.message : String(e)}`); }
    try { await this.checkExpiredBatches(results); } catch (e) { this.logger.error(`Expired check failed: ${e instanceof Error ? e.message : String(e)}`); }
    try { await this.checkPaymentDueDates(results); } catch (e) { this.logger.error(`Payment due check failed: ${e instanceof Error ? e.message : String(e)}`); }
    try { await this.checkPaymentOverdue(results); } catch (e) { this.logger.error(`Payment overdue check failed: ${e instanceof Error ? e.message : String(e)}`); }

    this.logger.log(`Stock alerts check complete: ${JSON.stringify(results)}`);
    return results;
  }

  private async checkZeroDispatcherStock(results: { zeroStock: number }) {
    const dispatcherLocations = await this.databaseService.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.name, 'Dispatcher'));

    if (dispatcherLocations.length === 0) return;

    const dispatcherIds = dispatcherLocations.map((l) => l.id);

    const allItems = await this.databaseService.db
      .select({ id: items.id, name: items.name })
      .from(items);

    for (const item of allItems) {
      const dispatcherQty = await this.getItemTotalQuantity(item.id, dispatcherIds);
      if (dispatcherQty > 0) continue;

      const storeLocations = await this.databaseService.db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.name, 'Store'));

      if (storeLocations.length === 0) continue;

      const storeIds = storeLocations.map((l) => l.id);
      const storeQty = await this.getItemTotalQuantity(item.id, storeIds);
      if (storeQty === 0) continue;

      const existing = await this.notificationsService.hasExistingUnread(
        'zero_stock',
        'itemId',
        item.id,
      );
      if (existing) continue;

      await this.notificationsService.createNotification({
        type: 'zero_stock',
        title: 'Zero Dispatcher Stock',
        message: `${item.name} is out of stock at the counter but ${storeQty} units are available at Store — transfer needed.`,
        itemId: item.id,
      });
      results.zeroStock++;
    }
  }

  private async checkLowStoreStock(results: { lowStock: number }) {
    const storeLocations = await this.databaseService.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.name, 'Store'));

    if (storeLocations.length === 0) return;

    const storeIds = storeLocations.map((l) => l.id);

    const allItems = await this.databaseService.db
      .select({ id: items.id, name: items.name, reorderLevel: items.reorderLevel })
      .from(items);

    for (const item of allItems) {
      const storeQty = await this.getItemTotalQuantity(item.id, storeIds);
      const reorderLevel = item.reorderLevel ?? 0;

      if (storeQty >= reorderLevel || reorderLevel === 0) continue;

      const existing = await this.notificationsService.hasExistingUnread(
        'low_stock',
        'itemId',
        item.id,
      );
      if (existing) continue;

      await this.notificationsService.createNotification({
        type: 'low_stock',
        title: 'Low Store Stock',
        message: `${item.name} is low at Store: ${storeQty} remaining, reorder level is ${reorderLevel}.`,
        itemId: item.id,
      });
      results.lowStock++;
    }
  }

  private async checkNearExpiryBatches(results: { nearExpiry: number }) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const batchesWithStock = await this.getBatchesWithStock();
    const thresholds = [
      { days: 90, label: '90' },
      { days: 60, label: '60' },
      { days: 30, label: '30' },
    ];

    for (const batch of batchesWithStock) {
      if (batch.expiryDate < todayStr || batch.expiryDate >= in90Days) continue;

      for (const threshold of thresholds) {
        const thresholdDate = new Date(today.getTime() + threshold.days * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];

        if (batch.expiryDate <= thresholdDate) {
          const existing = await this.notificationsService.hasExistingUnreadWithThreshold(
            'near_expiry',
            batch.batchId,
            threshold.days,
          );
          if (!existing) {
            const totalQty = await this.getBatchTotalQuantity(batch.batchId);
            await this.notificationsService.createNotification({
              type: 'near_expiry',
              title: 'Near-Expiry Warning',
              message: `Batch ${batch.batchNo} of ${batch.itemName} expires in ${threshold.days} days (${totalQty} units remaining).`,
              itemId: batch.itemId,
              batchId: batch.batchId,
              thresholdDays: threshold.days,
            });
            results.nearExpiry++;
          }
          break;
        }
      }
    }
  }

  private async checkExpiredBatches(results: { expired: number }) {
    const todayStr = new Date().toISOString().split('T')[0];

    const batchesWithStock = await this.getBatchesWithStock();

    for (const batch of batchesWithStock) {
      if (batch.expiryDate >= todayStr) continue;

      const existing = await this.notificationsService.hasExistingUnread(
        'expired',
        'batchId',
        batch.batchId,
      );
      if (existing) continue;

      const totalQty = await this.getBatchTotalQuantity(batch.batchId);
      await this.notificationsService.createNotification({
        type: 'expired',
        title: 'Expired Batch',
        message: `Batch ${batch.batchNo} of ${batch.itemName} expired on ${batch.expiryDate} — ${totalQty} units still in stock and must be removed from sale.`,
        itemId: batch.itemId,
        batchId: batch.batchId,
      });
      results.expired++;
    }
  }

  private async checkPaymentDueDates(results: { paymentDue: number }) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const grnWithDueDates = await this.databaseService.db
      .select({
        grnId: goodsReceipts.id,
        grnNumber: goodsReceipts.grnNumber,
        paymentDueDate: goodsReceipts.paymentDueDate,
        supplierId: goodsReceipts.supplierId,
        supplierName: suppliers.name,
        totalCost: goodsReceipts.totalCost,
      })
      .from(goodsReceipts)
      .innerJoin(suppliers, eq(goodsReceipts.supplierId, suppliers.id))
      .where(
        and(
          sql`${goodsReceipts.paymentDueDate} IS NOT NULL`,
          gte(goodsReceipts.paymentDueDate, todayStr),
          lt(goodsReceipts.paymentDueDate, in7Days),
        ),
      );

    for (const grn of grnWithDueDates) {
      if (!grn.paymentDueDate) continue;

      const existing = await this.notificationsService.hasExistingUnread(
        'payment_due',
        'itemId',
        grn.grnId,
      );
      if (existing) continue;

      const daysUntilDue = Math.ceil(
        (new Date(grn.paymentDueDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );

      await this.notificationsService.createNotification({
        type: 'payment_due',
        title: 'Payment Due Soon',
        message: `Payment for GRN ${grn.grnNumber} (${grn.supplierName}) of ${grn.totalCost} is due in ${daysUntilDue} day(s) on ${grn.paymentDueDate}.`,
        itemId: grn.grnId,
      });
      results.paymentDue++;
    }
  }

  private async checkPaymentOverdue(results: { paymentOverdue: number }) {
    const todayStr = new Date().toISOString().split('T')[0];

    const overdueGrns = await this.databaseService.db
      .select({
        grnId: goodsReceipts.id,
        grnNumber: goodsReceipts.grnNumber,
        paymentDueDate: goodsReceipts.paymentDueDate,
        supplierId: goodsReceipts.supplierId,
        supplierName: suppliers.name,
        totalCost: goodsReceipts.totalCost,
      })
      .from(goodsReceipts)
      .innerJoin(suppliers, eq(goodsReceipts.supplierId, suppliers.id))
      .where(
        and(
          sql`${goodsReceipts.paymentDueDate} IS NOT NULL`,
          lt(goodsReceipts.paymentDueDate, todayStr),
        ),
      );

    for (const grn of overdueGrns) {
      if (!grn.paymentDueDate) continue;

      const existing = await this.notificationsService.hasExistingUnread(
        'payment_overdue',
        'itemId',
        grn.grnId,
      );
      if (existing) continue;

      const daysOverdue = Math.ceil(
        (new Date().getTime() - new Date(grn.paymentDueDate).getTime()) / (24 * 60 * 60 * 1000),
      );

      await this.notificationsService.createNotification({
        type: 'payment_overdue',
        title: 'Payment Overdue',
        message: `Payment for GRN ${grn.grnNumber} (${grn.supplierName}) of ${grn.totalCost} is ${daysOverdue} day(s) overdue (was due ${grn.paymentDueDate}).`,
        itemId: grn.grnId,
      });
      results.paymentOverdue++;
    }
  }

  private async getItemTotalQuantity(itemId: string, locationIds: string[]): Promise<number> {
    if (locationIds.length === 0) return 0;

    const result = await this.databaseService.db
      .select({
        total: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
      })
      .from(stockMovements)
      .innerJoin(batches, eq(stockMovements.batchId, batches.id))
      .where(
        and(
          eq(batches.itemId, itemId),
          sql`${stockMovements.locationId} IN ${locationIds}`,
        ),
      );
    return Number(result[0]?.total ?? 0);
  }

  private async getBatchesWithStock() {
    const result = await this.databaseService.db
      .select({
        batchId: batches.id,
        batchNo: batches.batchNo,
        expiryDate: sql<string>`to_char(${batches.expiryDate}, 'YYYY-MM-DD')`,
        itemId: batches.itemId,
        itemName: items.name,
      })
      .from(batches)
      .innerJoin(items, eq(batches.itemId, items.id))
      .innerJoin(stockMovements, eq(stockMovements.batchId, batches.id))
      .groupBy(batches.id, batches.batchNo, batches.expiryDate, batches.itemId, items.name)
      .having(sql`coalesce(sum(${stockMovements.quantity}), 0) > 0`);

    return result;
  }

  private async getBatchTotalQuantity(batchId: string): Promise<number> {
    const result = await this.databaseService.db
      .select({
        total: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
      })
      .from(stockMovements)
      .where(eq(stockMovements.batchId, batchId));
    return Number(result[0]?.total ?? 0);
  }
}
