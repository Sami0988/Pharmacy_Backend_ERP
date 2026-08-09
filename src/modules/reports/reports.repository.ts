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
  suppliers,
  locations,
  users,
  supplierPayments,
} from '../../db';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import { paginate, PaginatedResponse } from '../../common/pagination';

@Injectable()
export class ReportsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async getStockReportRaw(): Promise<Array<{
    itemId: string;
    itemName: string;
    storeQuantity: number;
    dispatcherQuantity: number;
    totalQuantity: number;
    totalValueAtCost: number;
    sellingPrice: number;
  }>> {
    const result = await this.databaseService.db
      .select({
        itemId: items.id,
        itemName: items.name,
        storeQuantity: sql<number>`coalesce(sum(case when ${locations.name} = 'Store' then ${stockMovements.quantity} else 0 end), 0)`,
        dispatcherQuantity: sql<number>`coalesce(sum(case when ${locations.name} = 'Dispatcher' then ${stockMovements.quantity} else 0 end), 0)`,
        totalQuantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
        avgCost: sql<number>`coalesce(avg(cast(${batches.unitCost} as decimal)), 0)`,
        sellingPrice: sql<string>`coalesce((
          select b2.selling_price from batches b2
          inner join stock_movements sm2 on sm2.batch_id = b2.id
          where b2.item_id = ${items.id} and sm2.location_id in (
            select l2.id from locations l2 where l2.name = 'Dispatcher'
          )
          group by b2.id, b2.selling_price
          order by sum(sm2.quantity) desc
          limit 1
        ), '0')`,
      })
      .from(items)
      .innerJoin(batches, eq(batches.itemId, items.id))
      .innerJoin(stockMovements, eq(stockMovements.batchId, batches.id))
      .innerJoin(locations, eq(stockMovements.locationId, locations.id))
      .where(sql`${locations.name} IN ('Store', 'Dispatcher')`)
      .groupBy(items.id, items.name)
      .having(sql`sum(${stockMovements.quantity}) > 0`);

    return result.map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      storeQuantity: Number(r.storeQuantity),
      dispatcherQuantity: Number(r.dispatcherQuantity),
      totalQuantity: Number(r.totalQuantity),
      totalValueAtCost: Math.round(Number(r.totalQuantity) * Number(r.avgCost) * 100) / 100,
      sellingPrice: Number(r.sellingPrice),
    }));
  }

  async getStockReport(params: { page: number; limit: number }): Promise<PaginatedResponse<any>> {
    const whereClause = sql`${locations.name} IN ('Store', 'Dispatcher')`;

    const baseQuery = this.databaseService.db
      .select({
        itemId: items.id,
        itemName: items.name,
        storeQuantity: sql<number>`coalesce(sum(case when ${locations.name} = 'Store' then ${stockMovements.quantity} else 0 end), 0)`,
        dispatcherQuantity: sql<number>`coalesce(sum(case when ${locations.name} = 'Dispatcher' then ${stockMovements.quantity} else 0 end), 0)`,
        totalQuantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
        avgCost: sql<number>`coalesce(avg(cast(${batches.unitCost} as decimal)), 0)`,
        sellingPrice: sql<string>`coalesce((
          select b2.selling_price from batches b2
          inner join stock_movements sm2 on sm2.batch_id = b2.id
          where b2.item_id = ${items.id} and sm2.location_id in (
            select l2.id from locations l2 where l2.name = 'Dispatcher'
          )
          group by b2.id, b2.selling_price
          order by sum(sm2.quantity) desc
          limit 1
        ), '0')`,
      })
      .from(items)
      .innerJoin(batches, eq(batches.itemId, items.id))
      .innerJoin(stockMovements, eq(stockMovements.batchId, batches.id))
      .innerJoin(locations, eq(stockMovements.locationId, locations.id))
      .where(whereClause)
      .groupBy(items.id, items.name)
      .having(sql`sum(${stockMovements.quantity}) > 0`);

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(
        this.databaseService.db
          .select({ itemId: items.id })
          .from(items)
          .innerJoin(batches, eq(batches.itemId, items.id))
          .innerJoin(stockMovements, eq(stockMovements.batchId, batches.id))
          .innerJoin(locations, eq(stockMovements.locationId, locations.id))
          .where(whereClause)
          .groupBy(items.id, items.name)
          .having(sql`sum(${stockMovements.quantity}) > 0`)
          .as('stock_groups'),
      );

    const result = await paginate<{
      itemId: string;
      itemName: string;
      storeQuantity: number;
      dispatcherQuantity: number;
      totalQuantity: number;
      avgCost: number;
      sellingPrice: string;
    }>({
      db: this.databaseService.db,
      baseQuery,
      countQuery,
      page: params.page,
      limit: params.limit,
    });

    return {
      ...result,
      data: result.data.map((r) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        storeQuantity: Number(r.storeQuantity),
        dispatcherQuantity: Number(r.dispatcherQuantity),
        totalQuantity: Number(r.totalQuantity),
        totalValueAtCost: Math.round(Number(r.totalQuantity) * Number(r.avgCost) * 100) / 100,
        sellingPrice: Number(r.sellingPrice),
      })),
    };
  }

  async getExpiryReport(withinDays: number = 90, params?: { page: number; limit: number }): Promise<PaginatedResponse<any>> {
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const whereClause = sql`(${batches.expiryDate} < ${today} OR (${batches.expiryDate} >= ${today} AND ${batches.expiryDate} < ${futureDate}))`;

    const baseQuery = this.databaseService.db
      .select({
        batchId: batches.id,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        unitCost: batches.unitCost,
        itemId: items.id,
        itemName: items.name,
        locationId: stockMovements.locationId,
        quantity: sql<string>`coalesce(sum(${stockMovements.quantity}), '0')`,
      })
      .from(batches)
      .innerJoin(items, eq(batches.itemId, items.id))
      .innerJoin(stockMovements, eq(stockMovements.batchId, batches.id))
      .where(whereClause)
      .groupBy(
        batches.id,
        batches.batchNo,
        batches.expiryDate,
        batches.unitCost,
        items.id,
        items.name,
        stockMovements.locationId,
      )
      .having(sql`coalesce(sum(${stockMovements.quantity}), 0) > 0`)
      .orderBy(batches.expiryDate);

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(
        this.databaseService.db
          .select({ batchId: batches.id })
          .from(batches)
          .innerJoin(items, eq(batches.itemId, items.id))
          .innerJoin(stockMovements, eq(stockMovements.batchId, batches.id))
          .where(whereClause)
          .groupBy(
            batches.id,
            batches.batchNo,
            batches.expiryDate,
            batches.unitCost,
            items.id,
            items.name,
            stockMovements.locationId,
          )
          .having(sql`coalesce(sum(${stockMovements.quantity}), 0) > 0`)
          .as('expiry_groups'),
      );

    const locationNames = await this.getLocationMap();

    if (params) {
      const result = await paginate<{
        batchId: string;
        batchNo: string;
        expiryDate: string;
        unitCost: string;
        itemId: string;
        itemName: string;
        locationId: string;
        quantity: string;
      }>({
        db: this.databaseService.db,
        baseQuery,
        countQuery,
        page: params.page,
        limit: params.limit,
      });

      return {
        ...result,
        data: result.data.map((r) => ({
          batchId: r.batchId,
          batchNo: r.batchNo,
          expiryDate: r.expiryDate,
          itemName: r.itemName,
          locationName: locationNames.get(r.locationId) ?? 'Unknown',
          quantity: Number(r.quantity),
          unitCost: parseFloat(r.unitCost),
          isExpired: r.expiryDate < today,
        })),
      };
    }

    const allResult = await baseQuery;
    const [{ count: totalItems }] = await countQuery;
    return {
      data: allResult.map((r) => ({
        batchId: r.batchId,
        batchNo: r.batchNo,
        expiryDate: r.expiryDate,
        itemName: r.itemName,
        locationName: locationNames.get(r.locationId) ?? 'Unknown',
        quantity: Number(r.quantity),
        unitCost: parseFloat(r.unitCost),
        isExpired: r.expiryDate < today,
      })),
      meta: {
        page: 1,
        limit: Number(totalItems),
        totalItems: Number(totalItems),
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  async getSalesReport(startDate?: string, endDate?: string, params?: { page: number; limit: number }): Promise<PaginatedResponse<any>> {
    const conditions: any[] = [];
    if (startDate) conditions.push(sql`date(${sales.createdAt}) >= ${startDate}`);
    if (endDate) conditions.push(sql`date(${sales.createdAt}) <= ${endDate}`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = this.databaseService.db
      .select({
        saleId: sales.id,
        saleDate: sales.createdAt,
        totalAmount: sales.totalAmount,
        paymentMethod: sales.paymentMethod,
        soldByName: users.name,
        itemName: items.name,
        batchNo: batches.batchNo,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        unitCost: batches.unitCost,
      })
      .from(sales)
      .innerJoin(users, eq(sales.soldBy, users.id))
      .innerJoin(saleItems, eq(saleItems.saleId, sales.id))
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .innerJoin(items, eq(batches.itemId, items.id))
      .where(where)
      .orderBy(desc(sales.createdAt));

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(sales)
      .innerJoin(saleItems, eq(saleItems.saleId, sales.id))
      .where(where);

    if (params) {
      const result = await paginate<any>({
        db: this.databaseService.db,
        baseQuery,
        countQuery,
        page: params.page,
        limit: params.limit,
      });

      return {
        ...result,
        data: result.data.map((r: any) => ({
          saleId: r.saleId,
          saleDate: r.saleDate,
          itemName: r.itemName,
          batchNo: r.batchNo,
          quantity: r.quantity,
          unitPrice: parseFloat(r.unitPrice),
          lineTotal: r.quantity * parseFloat(r.unitPrice),
          totalAmount: parseFloat(r.totalAmount),
          paymentMethod: r.paymentMethod,
          soldByName: r.soldByName,
        })),
      };
    }

    const allResult = await baseQuery;
    const [{ count: totalItems }] = await countQuery;
    return {
      data: allResult.map((r: any) => ({
        saleId: r.saleId,
        saleDate: r.saleDate,
        itemName: r.itemName,
        batchNo: r.batchNo,
        quantity: r.quantity,
        unitPrice: parseFloat(r.unitPrice),
        lineTotal: r.quantity * parseFloat(r.unitPrice),
        totalAmount: parseFloat(r.totalAmount),
        paymentMethod: r.paymentMethod,
        soldByName: r.soldByName,
      })),
      meta: {
        page: 1,
        limit: Number(totalItems),
        totalItems: Number(totalItems),
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  async getSalesSummary(startDate?: string, endDate?: string) {
    const conditions: any[] = [];
    if (startDate) conditions.push(sql`date(${sales.createdAt}) >= ${startDate}`);
    if (endDate) conditions.push(sql`date(${sales.createdAt}) <= ${endDate}`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [summary] = await this.databaseService.db
      .select({
        totalRevenue: sql<string>`coalesce(sum(${sales.totalAmount}), '0')`,
        totalItems: sql<string>`coalesce(sum(${saleItems.quantity}), 0)`,
        transactionCount: sql<string>`count(distinct ${sales.id})`,
      })
      .from(sales)
      .innerJoin(saleItems, eq(saleItems.saleId, sales.id))
      .where(where);

    const [costSummary] = await this.databaseService.db
      .select({
        totalCost: sql<string>`coalesce(sum(${saleItems.quantity} * ${batches.unitCost}), '0')`,
      })
      .from(saleItems)
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(where);

    const totalRevenue = parseFloat(summary?.totalRevenue ?? '0');
    const totalCost = parseFloat(costSummary?.totalCost ?? '0');

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalProfit: Math.round((totalRevenue - totalCost) * 100) / 100,
      totalItems: Number(summary?.totalItems ?? 0),
      transactionCount: Number(summary?.transactionCount ?? 0),
    };
  }

  async getSupplierBalanceReport() {
    const allSuppliers = await this.databaseService.db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers);

    const results: Array<{
      supplierId: string;
      supplierName: string;
      totalCost: number;
      totalPaid: number;
      outstanding: number;
    }> = [];

    for (const supplier of allSuppliers) {
      const paymentTotals = this.databaseService.db
        .select({
          grnId: supplierPayments.grnId,
          totalPaid: sql<string>`coalesce(sum(${supplierPayments.amountPaid}), '0')`,
        })
        .from(supplierPayments)
        .groupBy(supplierPayments.grnId)
        .as('payment_totals');

      const result = await this.databaseService.db
        .select({
          totalCost: sql<string>`coalesce(sum(${goodsReceipts.totalCost}), '0')`,
          totalPaid: sql<string>`coalesce(sum(${paymentTotals.totalPaid}), '0')`,
        })
        .from(goodsReceipts)
        .leftJoin(paymentTotals, eq(goodsReceipts.id, paymentTotals.grnId))
        .where(eq(goodsReceipts.supplierId, supplier.id));

      const totalCost = parseFloat(result[0]?.totalCost ?? '0');
      const totalPaid = parseFloat(result[0]?.totalPaid ?? '0');
      const outstanding = totalCost - totalPaid;

      if (outstanding > 0) {
        results.push({
          supplierId: supplier.id,
          supplierName: supplier.name,
          totalCost,
          totalPaid,
          outstanding,
        });
      }
    }

    results.sort((a, b) => b.outstanding - a.outstanding);
    return results;
  }

  private async getLocationMap(): Promise<Map<string, string>> {
    const locs = await this.databaseService.db
      .select({ id: locations.id, name: locations.name })
      .from(locations);
    return new Map(locs.map((l) => [l.id, l.name]));
  }

  async getLastSaleDate(itemId: string): Promise<string | null> {
    const result = await this.databaseService.db
      .select({ lastSaleDate: sql<string>`max(date(${sales.createdAt}))` })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .where(eq(batches.itemId, itemId));
    return result[0]?.lastSaleDate ?? null;
  }

  async getDeadStockReport(daysThreshold: number, params?: { page: number; limit: number }): Promise<PaginatedResponse<any>> {
    const lastSaleSubquery = this.databaseService.db
      .select({
        itemId: batches.itemId,
        lastSaleDate: sql<string>`max(date(${sales.createdAt}))`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .groupBy(batches.itemId)
      .as('last_sales');

    const stockAgg = this.databaseService.db
      .select({
        itemId: items.id,
        itemName: items.name,
        totalQuantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
        avgCost: sql<number>`coalesce(avg(cast(${batches.unitCost} as decimal)), 0)`,
      })
      .from(items)
      .innerJoin(batches, eq(batches.itemId, items.id))
      .innerJoin(stockMovements, eq(stockMovements.batchId, batches.id))
      .innerJoin(locations, eq(stockMovements.locationId, locations.id))
      .where(sql`${locations.name} IN ('Store', 'Dispatcher')`)
      .groupBy(items.id, items.name)
      .having(sql`sum(${stockMovements.quantity}) > 0`)
      .as('stock_agg');

    const baseQuery = this.databaseService.db
      .select({
        itemId: stockAgg.itemId,
        itemName: stockAgg.itemName,
        totalQuantityOnHand: stockAgg.totalQuantity,
        tiedUpValue: sql<number>`round(${stockAgg.totalQuantity} * ${stockAgg.avgCost}, 2)`,
        daysSinceLastSale: sql<number | null>`case when ${lastSaleSubquery.lastSaleDate} is null then null else floor(extract(day from now() - ${lastSaleSubquery.lastSaleDate}::timestamp)) end`,
      })
      .from(stockAgg)
      .leftJoin(lastSaleSubquery, eq(stockAgg.itemId, lastSaleSubquery.itemId))
      .where(
        sql`(${lastSaleSubquery.lastSaleDate} is null or floor(extract(day from now() - ${lastSaleSubquery.lastSaleDate}::timestamp)) > ${daysThreshold})`,
      )
      .orderBy(sql`round(${stockAgg.totalQuantity} * ${stockAgg.avgCost}, 2) desc`);

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(
        this.databaseService.db
          .select({ itemId: stockAgg.itemId })
          .from(stockAgg)
          .leftJoin(lastSaleSubquery, eq(stockAgg.itemId, lastSaleSubquery.itemId))
          .where(
            sql`(${lastSaleSubquery.lastSaleDate} is null or floor(extract(day from now() - ${lastSaleSubquery.lastSaleDate}::timestamp)) > ${daysThreshold})`,
          )
          .groupBy(stockAgg.itemId)
          .as('dead_stock_groups'),
      );

    if (params) {
      const result = await paginate<{
        itemId: string;
        itemName: string;
        totalQuantityOnHand: number;
        tiedUpValue: number;
        daysSinceLastSale: number | null;
      }>({
        db: this.databaseService.db,
        baseQuery,
        countQuery,
        page: params.page,
        limit: params.limit,
      });

      return {
        ...result,
        data: result.data.map((r) => ({
          itemId: r.itemId,
          itemName: r.itemName,
          totalQuantityOnHand: Number(r.totalQuantityOnHand),
          tiedUpValue: Number(r.tiedUpValue),
          daysSinceLastSale: r.daysSinceLastSale === null ? 'never sold' : Number(r.daysSinceLastSale),
        })),
      };
    }

    const allResult = await baseQuery;
    const [{ count: totalItems }] = await countQuery;
    return {
      data: allResult.map((r) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        totalQuantityOnHand: Number(r.totalQuantityOnHand),
        tiedUpValue: Number(r.tiedUpValue),
        daysSinceLastSale: r.daysSinceLastSale === null ? 'never sold' : Number(r.daysSinceLastSale),
      })),
      meta: {
        page: 1,
        limit: Number(totalItems),
        totalItems: Number(totalItems),
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }
}
