import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { supplierPayments, goodsReceipts } from '../../db';
import { eq, and, sql, SQL, count, desc } from 'drizzle-orm';
import { paginate, PaginatedResponse } from '../../common/pagination';

@Injectable()
export class SupplierPaymentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(data: {
    supplierId: string;
    grnId: string;
    amountPaid: number;
    paymentDate: string;
    method: string;
    notes?: string;
  }) {
    const [row] = await this.databaseService.db
      .insert(supplierPayments)
      .values({
        ...data,
        amountPaid: String(data.amountPaid),
      })
      .returning();
    return row;
  }

  async findByGrnId(grnId: string) {
    return this.databaseService.db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.grnId, grnId))
      .orderBy(desc(supplierPayments.createdAt));
  }

  async findBySupplierId(
    supplierId: string,
    params: {
      page: number;
      limit: number;
    },
  ): Promise<PaginatedResponse<any>> {
    const where = eq(supplierPayments.supplierId, supplierId);

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(supplierPayments)
      .where(where);

    const baseQuery = this.databaseService.db
      .select()
      .from(supplierPayments)
      .where(where)
      .orderBy(desc(supplierPayments.createdAt));

    return paginate<any>({
      db: this.databaseService.db,
      baseQuery,
      countQuery,
      page: params.page,
      limit: params.limit,
    });
  }

  async calculateGrnBalance(grnId: string) {
    const result = await this.databaseService.db
      .select({
        totalCost: goodsReceipts.totalCost,
        totalPaid: sql<string>`coalesce(sum(${supplierPayments.amountPaid}), '0')`,
      })
      .from(goodsReceipts)
      .leftJoin(supplierPayments, eq(goodsReceipts.id, supplierPayments.grnId))
      .where(eq(goodsReceipts.id, grnId))
      .groupBy(goodsReceipts.id);

    if (result.length === 0) return null;

    const totalCost = parseFloat(result[0].totalCost);
    const totalPaid = parseFloat(result[0].totalPaid);
    return {
      totalCost,
      totalPaid,
      outstanding: totalCost - totalPaid,
    };
  }

  async calculateSupplierBalance(supplierId: string) {
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
      .where(eq(goodsReceipts.supplierId, supplierId));

    const totalCost = parseFloat(result[0].totalCost);
    const totalPaid = parseFloat(result[0].totalPaid);
    return {
      totalCost,
      totalPaid,
      outstanding: totalCost - totalPaid,
    };
  }

  async getAllSuppliersWithOutstanding() {
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
        supplierId: goodsReceipts.supplierId,
        totalCost: sql<string>`coalesce(sum(${goodsReceipts.totalCost}), '0')`,
        totalPaid: sql<string>`coalesce(sum(${paymentTotals.totalPaid}), '0')`,
      })
      .from(goodsReceipts)
      .leftJoin(paymentTotals, eq(goodsReceipts.id, paymentTotals.grnId))
      .groupBy(goodsReceipts.supplierId)
      .having(
        sql`coalesce(sum(${goodsReceipts.totalCost}), '0') - coalesce(sum(${paymentTotals.totalPaid}), '0') > 0`,
      )
      .orderBy(
        sql`coalesce(sum(${goodsReceipts.totalCost}), '0') - coalesce(sum(${paymentTotals.totalPaid}), '0') desc`,
      );

    return result.map((r) => ({
      supplierId: r.supplierId,
      totalCost: parseFloat(r.totalCost),
      totalPaid: parseFloat(r.totalPaid),
      outstanding: parseFloat(r.totalCost) - parseFloat(r.totalPaid),
    }));
  }
}
