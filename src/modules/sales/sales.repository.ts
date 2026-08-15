import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import {
  sales,
  saleItems,
  saleReturns,
  stockMovements,
  batches,
  items,
  branches,
  users,
  customers,
} from '../../db';
import { eq, and, SQL, sql, desc, gte, lt, or, count, asc } from 'drizzle-orm';
import { paginate, PaginatedResponse } from '../../common/pagination';

@Injectable()
export class SalesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createSale(
    data: typeof sales.$inferInsert,
    items: Array<typeof saleItems.$inferInsert>,
  ) {
    return this.databaseService.db.transaction(async (tx) => {
      const [sale] = await tx.insert(sales).values(data).returning();

      const saleItemsRows = await tx
        .insert(saleItems)
        .values(items.map((item) => ({ ...item, saleId: sale.id })))
        .returning();

      return { sale, saleItems: saleItemsRows };
    });
  }

  async createSaleReturn(data: typeof saleReturns.$inferInsert) {
    const [row] = await this.databaseService.db
      .insert(saleReturns)
      .values(data)
      .returning();
    return row;
  }

  async findById(id: string) {
    const result = await this.databaseService.db
      .select({
        id: sales.id,
        branchId: sales.branchId,
        customerId: sales.customerId,
        soldBy: sales.soldBy,
        totalAmount: sales.totalAmount,
        paymentMethod: sales.paymentMethod,
        receiptUrl: sales.receiptUrl,
        receiptGenerated: sales.receiptGenerated,
        createdAt: sales.createdAt,
        branchName: branches.name,
        customerName: customers.name,
        customerPhone: customers.phone,
        soldByName: users.name,
      })
      .from(sales)
      .innerJoin(branches, eq(sales.branchId, branches.id))
      .innerJoin(users, eq(sales.soldBy, users.id))
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(eq(sales.id, id))
      .limit(1);

    if (result.length === 0) return null;

    const lineItems = await this.databaseService.db
      .select({
        id: saleItems.id,
        saleId: saleItems.saleId,
        batchId: saleItems.batchId,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        createdAt: saleItems.createdAt,
        batchNo: batches.batchNo,
        itemName: items.name,
        itemId: items.id,
      })
      .from(saleItems)
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .innerJoin(items, eq(batches.itemId, items.id))
      .where(eq(saleItems.saleId, id));

    return { ...result[0], items: lineItems };
  }

  async findSaleItemById(saleItemId: string) {
    const result = await this.databaseService.db
      .select({
        id: saleItems.id,
        saleId: saleItems.saleId,
        batchId: saleItems.batchId,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        batchNo: batches.batchNo,
        itemName: items.name,
        itemId: items.id,
      })
      .from(saleItems)
      .innerJoin(batches, eq(saleItems.batchId, batches.id))
      .innerJoin(items, eq(batches.itemId, items.id))
      .where(eq(saleItems.id, saleItemId))
      .limit(1);

    return result[0] ?? null;
  }

  async getReturnableQuantity(saleItemId: string) {
    const sold = await this.databaseService.db
      .select({ quantity: saleItems.quantity })
      .from(saleItems)
      .where(eq(saleItems.id, saleItemId))
      .limit(1);

    if (sold.length === 0) return 0;

    const returned = await this.databaseService.db
      .select({
        total: sql<number>`coalesce(sum(${saleReturns.quantity}), 0)`,
      })
      .from(saleReturns)
      .where(eq(saleReturns.saleItemId, saleItemId));

    return Number(sold[0].quantity) - Number(returned[0]?.total ?? 0);
  }

  async updateReceiptUrl(id: string, receiptUrl: string | null) {
    await this.databaseService.db
      .update(sales)
      .set({ receiptUrl, receiptGenerated: receiptUrl !== null })
      .where(eq(sales.id, id));
  }

  async hardDelete(id: string) {
    return this.databaseService.db.transaction(async (tx) => {
      // Find all sale items for this sale
      const items = await tx
        .select({ id: saleItems.id })
        .from(saleItems)
        .where(eq(saleItems.saleId, id));

      // Delete sale returns for each sale item
      for (const item of items) {
        await tx
          .delete(saleReturns)
          .where(eq(saleReturns.saleItemId, item.id));
      }

      // Delete stock movements for this sale
      await tx
        .delete(stockMovements)
        .where(
          and(
            eq(stockMovements.refId, id),
            eq(stockMovements.refType, 'sale'),
          ),
        );

      // Delete sale items
      await tx
        .delete(saleItems)
        .where(eq(saleItems.saleId, id));

      // Delete the sale
      const [deleted] = await tx
        .delete(sales)
        .where(eq(sales.id, id))
        .returning();

      return deleted;
    });
  }

  async findAll(params: {
    page: number;
    limit: number;
    branchId?: string;
    customerId?: string;
    soldBy?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const conditions: SQL[] = [];

    if (params.branchId) {
      conditions.push(eq(sales.branchId, params.branchId));
    }
    if (params.customerId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.customerId);
      if (isUuid) {
        conditions.push(eq(sales.customerId, params.customerId));
      } else {
        conditions.push(sql`${customers.name} ILIKE ${`%${params.customerId}%`}`);
      }
    }
    if (params.soldBy) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.soldBy);
      if (isUuid) {
        conditions.push(eq(sales.soldBy, params.soldBy));
      } else {
        conditions.push(sql`${users.name} ILIKE ${`%${params.soldBy}%`}`);
      }
    }
    if (params.fromDate) {
      conditions.push(gte(sales.createdAt, new Date(params.fromDate)));
    }
    if (params.toDate) {
      const nextDay = new Date(params.toDate);
      nextDay.setDate(nextDay.getDate() + 1);
      conditions.push(lt(sales.createdAt, nextDay));
    }
    if (params.search) {
      conditions.push(
        or(
          sql`${branches.name} ILIKE ${`%${params.search}%`}`,
          sql`${customers.name} ILIKE ${`%${params.search}%`}`,
          sql`${users.name} ILIKE ${`%${params.search}%`}`,
          sql`${sales.receiptUrl} ILIKE ${`%${params.search}%`}`,
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(sales)
      .innerJoin(branches, eq(sales.branchId, branches.id))
      .innerJoin(users, eq(sales.soldBy, users.id))
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(whereClause);

    const ALLOWED_SORT_FIELDS: Record<string, any> = {
      createdAt: sales.createdAt,
      totalAmount: sales.totalAmount,
      paymentMethod: sales.paymentMethod,
      branchName: branches.name,
      customerName: customers.name,
    };

    const col = params.sortBy ? ALLOWED_SORT_FIELDS[params.sortBy] : undefined;
    const orderCol = col || sales.createdAt;

    const baseQuery = this.databaseService.db
      .select({
        id: sales.id,
        branchId: sales.branchId,
        customerId: sales.customerId,
        soldBy: sales.soldBy,
        totalAmount: sales.totalAmount,
        paymentMethod: sales.paymentMethod,
        receiptUrl: sales.receiptUrl,
        receiptGenerated: sales.receiptGenerated,
        createdAt: sales.createdAt,
        branchName: branches.name,
        customerName: customers.name,
        soldByName: users.name,
      })
      .from(sales)
      .innerJoin(branches, eq(sales.branchId, branches.id))
      .innerJoin(users, eq(sales.soldBy, users.id))
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(whereClause)
      .orderBy(params.sortOrder === 'asc' ? asc(orderCol) : desc(orderCol));

    return paginate<any>({
      db: this.databaseService.db,
      baseQuery,
      countQuery,
      page: params.page,
      limit: params.limit,
    });
  }
}
