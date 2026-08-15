import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import {
  items,
  batches,
  stockMovements,
  sales,
  saleItems,
  saleReturns,
  goodsReceipts,
  locations,
  customers,
  notifications,
  supplierPayments,
  auditLog,
} from '../../db';
import { eq, and, or, sql, desc, gte, lt } from 'drizzle-orm';

const formatDate = (date: Date) => date.toISOString().split('T')[0];

@Injectable()
export class DashboardRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async getTodaySalesSummary() {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.databaseService.db
      .select({
        totalAmount: sql<string>`coalesce(sum(${sales.totalAmount}), '0')`,
        transactionCount: sql<number>`count(${sales.id})`,
      })
      .from(sales)
      .where(sql`date(${sales.createdAt} AT TIME ZONE 'UTC') = ${today}`);
    return {
      totalAmount: parseFloat(result[0]?.totalAmount ?? '0'),
      transactionCount: Number(result[0]?.transactionCount ?? 0),
    };
  }
 
  async getInventoryCounts() {
    const rows = await this.databaseService.db
      .select({
        itemId: items.id,
        reorderLevel: items.reorderLevel,
        stockOnHand: sql<string>`coalesce(sum(${stockMovements.quantity}), '0')`,
      })
      .from(items)
      .leftJoin(batches, eq(batches.itemId, items.id))
      .leftJoin(stockMovements, eq(stockMovements.batchId, batches.id))
      .groupBy(items.id, items.reorderLevel);
 
    let totalProducts = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalStock = 0;
 
    for (const row of rows) {
      const stock = Number(row.stockOnHand);
      if (stock > 0) {
        totalProducts += 1;
      } else {
        outOfStockCount += 1;
      }
 
      if (stock > 0 && stock < (row.reorderLevel ?? 0)) {
        lowStockCount += 1;
      }
 
      totalStock += stock;
    }
 
    return {
      totalProducts,
      lowStockCount,
      outOfStockCount,
      totalStock,
    };
  }
 
  async getCategoryBreakdown() {
    const rows = await this.databaseService.db
      .select({
        category: items.category,
        quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), '0')`,
      })
      .from(items)
      .leftJoin(batches, eq(batches.itemId, items.id))
      .leftJoin(stockMovements, eq(stockMovements.batchId, batches.id))
      .groupBy(items.category)
      .orderBy(sql`coalesce(sum(${stockMovements.quantity}), 0) desc`);
 
    return rows
      .map((row) => ({
        category: row.category || 'Uncategorized',
        count: Number(row.quantity),
      }))
      .filter((row) => row.count > 0);
  }
 
  async getRevenueTrend(months: number = 6) {
    const now = new Date();
    const firstMonth = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const startDate = formatDate(firstMonth);
    const monthKeys = Array.from({ length: months }, (_, index) => {
      const date = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return {
        monthLabel: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        monthKey,
      };
    });
 
    const salesRows = await this.databaseService.db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${sales.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM')`,
        revenue: sql<string>`coalesce(sum(${sales.totalAmount}), '0')`,
        profit: sql<string>`coalesce(sum(
          (cast(${saleItems.unitPrice} as decimal) - cast(${batches.unitCost} as decimal))
          * (${saleItems.quantity} - coalesce((
            select sum(${saleReturns.quantity}) from ${saleReturns}
            where ${saleReturns.saleItemId} = ${saleItems.id}
          ), 0))
        ), '0')`,
        creditSales: sql<string>`coalesce(sum(case when ${sales.paymentMethod} = 'credit' then ${sales.totalAmount} else 0 end), '0')`,
      })
      .from(sales)
      .innerJoin(saleItems, eq(saleItems.saleId, sales.id))
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .where(sql`date(${sales.createdAt} AT TIME ZONE 'UTC') >= ${startDate}`)
      .groupBy(sql`date_trunc('month', ${sales.createdAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`date_trunc('month', ${sales.createdAt} AT TIME ZONE 'UTC')`);
  
    const expenseRows = await this.databaseService.db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${goodsReceipts.receiptDate} AT TIME ZONE 'UTC'), 'YYYY-MM')`,
        expenses: sql<string>`coalesce(sum(${goodsReceipts.totalCost}), '0')`,
      })
      .from(goodsReceipts)
      .where(sql`date(${goodsReceipts.receiptDate} AT TIME ZONE 'UTC') >= ${startDate}`)
      .groupBy(sql`date_trunc('month', ${goodsReceipts.receiptDate} AT TIME ZONE 'UTC')`)
      .orderBy(sql`date_trunc('month', ${goodsReceipts.receiptDate} AT TIME ZONE 'UTC')`);
 
    const combined = new Map<string, { month: string; revenue: number; profit: number; expenses: number; creditSales: number }>();
 
    for (const row of salesRows) {
      combined.set(row.month, {
        month: row.month,
        revenue: parseFloat(row.revenue),
        profit: parseFloat(row.profit),
        expenses: 0,
        creditSales: parseFloat(row.creditSales),
      });
    }
 
    for (const row of expenseRows) {
      const existing = combined.get(row.month);
      if (existing) {
        existing.expenses = parseFloat(row.expenses);
      } else {
        combined.set(row.month, {
          month: row.month,
          revenue: 0,
          profit: 0,
          expenses: parseFloat(row.expenses),
          creditSales: 0,
        });
      }
    }
 
    return monthKeys.map(({ monthLabel, monthKey }) => {
      const row = combined.get(monthKey);
      return {
        month: monthLabel,
        revenue: row?.revenue ?? 0,
        profit: row?.profit ?? 0,
        expenses: row?.expenses ?? 0,
        creditSales: row?.creditSales ?? 0,
      };
    });
  }
 
  async getSparklineSeries(days: number = 14) {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const startDate = formatDate(start);
 
    const dateKeys = Array.from({ length: days }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const label = formatDate(date);
      return { label, date };
    });
 
    const salesRows = await this.databaseService.db
      .select({
        day: sql<string>`to_char(date(${sales.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
        totalSales: sql<string>`coalesce(sum(${sales.totalAmount}), '0')`,
        profit: sql<string>`coalesce(sum(
          (cast(${saleItems.unitPrice} as decimal) - cast(${batches.unitCost} as decimal))
          * (${saleItems.quantity} - coalesce((
            select sum(${saleReturns.quantity}) from ${saleReturns}
            where ${saleReturns.saleItemId} = ${saleItems.id}
          ), 0))
        ), '0')`,
        creditSales: sql<string>`coalesce(sum(case when ${sales.paymentMethod} = 'credit' then ${sales.totalAmount} else 0 end), '0')`,
      })
      .from(sales)
      .innerJoin(saleItems, eq(saleItems.saleId, sales.id))
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .where(sql`date(${sales.createdAt} AT TIME ZONE 'UTC') >= ${startDate}`)
      .groupBy(sql`date(${sales.createdAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`date(${sales.createdAt} AT TIME ZONE 'UTC')`);
  
    const stockBefore = await this.databaseService.db
      .select({
        onHand: sql<string>`coalesce(sum(${stockMovements.quantity}), '0')`,
      })
      .from(stockMovements)
      .where(sql`date(${stockMovements.createdAt} AT TIME ZONE 'UTC') < ${startDate}`);
    const startingStock = Number(stockBefore[0]?.onHand ?? '0');
 
    const stockRows = await this.databaseService.db
      .select({
        day: sql<string>`to_char(date(${stockMovements.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
        delta: sql<string>`coalesce(sum(${stockMovements.quantity}), '0')`,
      })
      .from(stockMovements)
      .where(sql`date(${stockMovements.createdAt} AT TIME ZONE 'UTC') >= ${startDate}`)
      .groupBy(sql`date(${stockMovements.createdAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`date(${stockMovements.createdAt} AT TIME ZONE 'UTC')`);
 
    const notificationRows = await this.databaseService.db
      .select({
        day: sql<string>`to_char(date(${notifications.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
        lowStock: sql<string>`coalesce(sum(case when ${notifications.type} = 'low_stock' then 1 else 0 end), '0')`,
        expiringSoon: sql<string>`coalesce(sum(case when ${notifications.type} = 'near_expiry' then 1 else 0 end), '0')`,
      })
      .from(notifications)
      .where(sql`date(${notifications.createdAt} AT TIME ZONE 'UTC') >= ${startDate}`)
      .groupBy(sql`date(${notifications.createdAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`date(${notifications.createdAt} AT TIME ZONE 'UTC')`);
 
    const auditRows = await this.databaseService.db
      .select({
        day: sql<string>`to_char(date(${auditLog.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
        count: sql<string>`coalesce(count(${auditLog.id}), '0')`,
      })
      .from(auditLog)
      .where(sql`date(${auditLog.createdAt} AT TIME ZONE 'UTC') >= ${startDate}`)
      .groupBy(sql`date(${auditLog.createdAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`date(${auditLog.createdAt} AT TIME ZONE 'UTC')`);
 
    const salesMap = new Map(
      salesRows.map((row) => [row.day, {
        sales: Number(row.totalSales),
        profit: Number(row.profit),
        creditSales: Number(row.creditSales),
      }]),
    );
    const stockDeltaMap = new Map(stockRows.map((row) => [row.day, Number(row.delta)]));
    const notificationMap = new Map(notificationRows.map((row) => [row.day, {
      lowStock: Number(row.lowStock),
      expiringSoon: Number(row.expiringSoon),
    }]));
    const auditMap = new Map(auditRows.map((row) => [row.day, Number(row.count)]));
 
    let runningStock = startingStock;
    return dateKeys.map(({ label }) => {
      runningStock += stockDeltaMap.get(label) ?? 0;
      const salesEntry = salesMap.get(label);
      const notificationEntry = notificationMap.get(label);
      return {
        date: label,
        sales: salesEntry?.sales ?? 0,
        profit: salesEntry?.profit ?? 0,
        creditSales: salesEntry?.creditSales ?? 0,
        stockOnHand: Math.max(0, runningStock),
        lowStockAlerts: notificationEntry?.lowStock ?? 0,
        expiringSoonAlerts: notificationEntry?.expiringSoon ?? 0,
        auditEntries: auditMap.get(label) ?? 0,
      };
    });
  }
 
  async getTodayProfitEstimate() {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.databaseService.db
      .select({
        profit: sql<string>`coalesce(sum(
          (cast(${saleItems.unitPrice} as decimal) - cast(${batches.unitCost} as decimal))
          * (${saleItems.quantity} - coalesce((
            select sum(${saleReturns.quantity}) from ${saleReturns}
            where ${saleReturns.saleItemId} = ${saleItems.id}
          ), 0))
        ), '0')`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .where(sql`date(${sales.createdAt} AT TIME ZONE 'UTC') = ${today}`);
    return parseFloat(result[0]?.profit ?? '0');
  }

  async getTopSellingItems(days: number = 30, limit: number = 5) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const result = await this.databaseService.db
      .select({
        itemId: items.id,
        itemName: items.name,
        quantitySold: sql<number>`sum(${saleItems.quantity})`,
        revenue: sql<string>`sum(cast(${saleItems.unitPrice} as decimal) * ${saleItems.quantity})`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .innerJoin(items, eq(batches.itemId, items.id))
      .where(sql`date(${sales.createdAt} AT TIME ZONE 'UTC') >= ${since}`)
      .groupBy(items.id, items.name)
      .orderBy(desc(sql`sum(${saleItems.quantity})`))
      .limit(limit);

    return result.map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      quantitySold: Number(r.quantitySold),
      revenue: parseFloat(r.revenue),
    }));
  }

  async getExpiringStockValue() {
    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const in60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const in90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const in180 = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const in270 = new Date(Date.now() + 270 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const getValue = async (fromDate: string, toDate: string) => {
      const result = await this.databaseService.db
        .select({
          value: sql<string>`coalesce(sum(
            cast(${batches.unitCost} as decimal) * coalesce((
              select sum(${stockMovements.quantity}) from ${stockMovements}
              where ${stockMovements.batchId} = ${batches.id}
            ), 0)
          ), '0')`,
        })
        .from(batches)
        .where(
          and(
            sql`${batches.expiryDate} >= ${fromDate}`,
            sql`${batches.expiryDate} < ${toDate}`,
          ),
        );
      return parseFloat(result[0]?.value ?? '0');
    };

    const [within30, within60, within90, within180, within270] = await Promise.all([
      getValue(today, in30),
      getValue(in30, in60),
      getValue(in60, in90),
      getValue(in90, in180),
      getValue(in180, in270),
    ]);

    return { within30Days: within30, within60Days: within60, within90Days: within90, within180Days: within180, within270Days: within270 };
  }

  async getItemSalesVelocity(days: number = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const result = await this.databaseService.db
      .select({
        itemId: items.id,
        itemName: items.name,
        quantitySold: sql<string>`coalesce(sum(${saleItems.quantity}), '0')`,
        reorderLevel: items.reorderLevel,
      })
      .from(items)
      .leftJoin(
        batches,
        eq(batches.itemId, items.id),
      )
      .leftJoin(
        saleItems,
        eq(saleItems.batchId, batches.id),
      )
      .leftJoin(
        sales,
        and(eq(sales.id, saleItems.saleId), sql`date(${sales.createdAt}) >= ${since}`),
      )
      .groupBy(items.id, items.name, items.reorderLevel);

    return result.map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      quantitySold: Number(r.quantitySold),
      reorderLevel: r.reorderLevel ?? 0,
    }));
  }

  async getStoreStockByItem() {
    const storeLocations = await this.databaseService.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.name, 'Store'));

    if (storeLocations.length === 0) return [];
    const storeIds = storeLocations.map((l) => l.id);

    const result = await this.databaseService.db
      .select({
        itemId: items.id,
        itemName: items.name,
        reorderLevel: items.reorderLevel,
        totalStock: sql<string>`coalesce(sum(${stockMovements.quantity}), '0')`,
      })
      .from(items)
      .innerJoin(batches, eq(batches.itemId, items.id))
      .innerJoin(stockMovements, eq(stockMovements.batchId, batches.id))
      .where(sql`${stockMovements.locationId} IN ${storeIds}`)
      .groupBy(items.id, items.name, items.reorderLevel);

    return result.map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      reorderLevel: r.reorderLevel ?? 0,
      currentStoreStock: Number(r.totalStock),
    }));
  }

  async getMostRecentGrnSupplier(itemId: string) {
    const result = await this.databaseService.db
      .select({ supplierId: goodsReceipts.supplierId })
      .from(goodsReceipts)
      .innerJoin(batches, eq(batches.grnId, goodsReceipts.id))
      .where(eq(batches.itemId, itemId))
      .orderBy(desc(goodsReceipts.receiptDate))
      .limit(1);
    return result[0]?.supplierId ?? null;
  }

  async getItemStockOnHand(itemId: string) {
    const result = await this.databaseService.db
      .select({
        locationId: stockMovements.locationId,
        total: sql<string>`coalesce(sum(${stockMovements.quantity}), '0')`,
      })
      .from(stockMovements)
      .innerJoin(batches, eq(stockMovements.batchId, batches.id))
      .where(eq(batches.itemId, itemId))
      .groupBy(stockMovements.locationId);
    return result;
  }

  async getMostRecentSaleDate(itemId: string) {
    const result = await this.databaseService.db
        .select({ lastSaleDate: sql<string>`max(date(${sales.createdAt} AT TIME ZONE 'UTC'))` })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .where(eq(batches.itemId, itemId));
    return result[0]?.lastSaleDate ?? null;
  }

  async getAllItemsWithStock() {
    const result = await this.databaseService.db
      .select({
        itemId: items.id,
        itemName: items.name,
        totalStock: sql<string>`coalesce((
          select sum(${stockMovements.quantity}) from ${stockMovements}
          inner join ${batches} on ${stockMovements.batchId} = ${batches.id}
          where ${batches.itemId} = ${items.id}
        ), '0')`,
      })
      .from(items)
      .having(sql`coalesce((
        select sum(${stockMovements.quantity}) from ${stockMovements}
        inner join ${batches} on ${stockMovements.batchId} = ${batches.id}
        where ${batches.itemId} = ${items.id}
      ), '0') > 0`)
      .groupBy(items.id, items.name);

    return result.map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      totalStock: Number(r.totalStock),
    }));
  }

  async getAverageUnitCost(itemId: string) {
    const result = await this.databaseService.db
      .select({
        avgCost: sql<string>`coalesce(avg(cast(${batches.unitCost} as decimal)), '0')`,
      })
      .from(batches)
      .where(eq(batches.itemId, itemId));
    return parseFloat(result[0]?.avgCost ?? '0');
  }
}
