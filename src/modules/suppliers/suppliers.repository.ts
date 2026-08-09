import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { suppliers, goodsReceipts, supplierPayments } from '../../db';
import { eq, ilike, and, isNull, SQL, desc, count, asc, sql } from 'drizzle-orm';
import { paginate, PaginatedResponse } from '../../common/pagination';

@Injectable()
export class SuppliersRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(params: {
    search?: string;
    includeDeleted?: boolean;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const conditions: SQL[] = [];
    if (!params.includeDeleted) {
      conditions.push(isNull(suppliers.deletedAt));
    }
    if (params.search) {
      conditions.push(ilike(suppliers.name, `%${params.search}%`));
    }

    const whereClause = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined;

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(suppliers)
      .where(whereClause);

    const ALLOWED_SORT_FIELDS: Record<string, any> = {
      name: suppliers.name,
      createdAt: suppliers.createdAt,
      phone: suppliers.phone,
    };

    const col = params.sortBy ? ALLOWED_SORT_FIELDS[params.sortBy] : undefined;
    const orderCol = col || suppliers.createdAt;

    const baseQuery = this.databaseService.db
      .select()
      .from(suppliers)
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

  async findById(id: string, includeDeleted = false) {
    const conditions: SQL[] = [eq(suppliers.id, id)];
    if (!includeDeleted) {
      conditions.push(isNull(suppliers.deletedAt));
    }
    const result = await this.databaseService.db
      .select()
      .from(suppliers)
      .where(and(...conditions))
      .limit(1);
    return result[0] || null;
  }

  async create(data: typeof suppliers.$inferInsert) {
    const [created] = await this.databaseService.db
      .insert(suppliers)
      .values(data)
      .returning();
    return created;
  }

  async update(id: string, data: Partial<typeof suppliers.$inferInsert>) {
    const [updated] = await this.databaseService.db
      .update(suppliers)
      .set(data)
      .where(eq(suppliers.id, id))
      .returning();
    return updated;
  }

  async softDelete(id: string) {
    const [deleted] = await this.databaseService.db
      .update(suppliers)
      .set({ deletedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning();
    return deleted;
  }

  async getBalances() {
    const result = await this.databaseService.db
      .select({
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        totalOwed: sql<string>`COALESCE(SUM(DISTINCT ${goodsReceipts.totalCost}), 0)`,
        totalPaid: sql<string>`COALESCE(SUM(DISTINCT ${supplierPayments.amountPaid}), 0)`,
      })
      .from(suppliers)
      .leftJoin(goodsReceipts, eq(suppliers.id, goodsReceipts.supplierId))
      .leftJoin(supplierPayments, eq(goodsReceipts.id, supplierPayments.grnId))
      .where(isNull(suppliers.deletedAt))
      .groupBy(suppliers.id, suppliers.name)
      .orderBy(desc(suppliers.createdAt));

    return result.map((r) => ({
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      totalOwed: Number(r.totalOwed),
      totalPaid: Number(r.totalPaid),
      balance: Number(r.totalOwed) - Number(r.totalPaid),
    }));
  }
}
