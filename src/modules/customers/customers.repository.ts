import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { customers, sales, saleItems, batches, items } from '../../db';
import { eq, or, ilike, and, isNull, SQL, sql, desc, count, asc } from 'drizzle-orm';
import { paginate, PaginatedResponse } from '../../common/pagination';

@Injectable()
export class CustomersRepository {
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
      conditions.push(isNull(customers.deletedAt));
    }
    if (params.search) {
      conditions.push(
        or(
          ilike(customers.name, `%${params.search}%`),
          ilike(customers.phone, `%${params.search}%`),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined;

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(customers)
      .where(whereClause);

    const ALLOWED_SORT_FIELDS: Record<string, any> = {
      name: customers.name,
      phone: customers.phone,
      createdAt: customers.createdAt,
      creditBalance: customers.creditBalance,
    };

    const col = params.sortBy ? ALLOWED_SORT_FIELDS[params.sortBy] : undefined;
    const orderCol = col || customers.createdAt;

    const baseQuery = this.databaseService.db
      .select()
      .from(customers)
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
    const conditions: SQL[] = [eq(customers.id, id)];
    if (!includeDeleted) {
      conditions.push(isNull(customers.deletedAt));
    }
    const result = await this.databaseService.db
      .select()
      .from(customers)
      .where(and(...conditions))
      .limit(1);
    return result[0] ?? null;
  }

  async create(data: typeof customers.$inferInsert) {
    const [created] = await this.databaseService.db
      .insert(customers)
      .values(data)
      .returning();
    return created;
  }

  async update(id: string, data: Partial<typeof customers.$inferInsert>) {
    const [updated] = await this.databaseService.db
      .update(customers)
      .set(data)
      .where(eq(customers.id, id))
      .returning();
    return updated;
  }

  async softDelete(id: string) {
    const [deleted] = await this.databaseService.db
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return deleted;
  }

  async incrementCreditBalance(id: string, amount: number) {
    await this.databaseService.db
      .update(customers)
      .set({
        creditBalance: sql`${customers.creditBalance} + ${amount}`,
      })
      .where(eq(customers.id, id));
  }

  async getCustomerSales(customerId: string) {
    return this.databaseService.db
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
      })
      .from(sales)
      .where(eq(sales.customerId, customerId))
      .orderBy(desc(sales.createdAt));
  }
}
