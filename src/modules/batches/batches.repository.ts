import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { batches } from '../../db';
import { eq, and, sql, SQL, count, asc } from 'drizzle-orm';
import { paginate, PaginatedResponse } from '../../common/pagination';

@Injectable()
export class BatchesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(params: {
    itemId?: string;
    expiringWithinDays?: number;
    search?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const conditions: SQL[] = [];
    if (params.itemId) {
      conditions.push(eq(batches.itemId, params.itemId));
    }
    if (params.expiringWithinDays) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + params.expiringWithinDays);
      conditions.push(
        sql`${batches.expiryDate} <= ${futureDate.toISOString().split('T')[0]}`,
      );
    }
    if (params.search) {
      conditions.push(
        sql`${batches.batchNo} ILIKE ${`%${params.search}%`}`,
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
      .from(batches)
      .where(whereClause);

    const ALLOWED_SORT_FIELDS: Record<string, any> = {
      batchNo: batches.batchNo,
      expiryDate: batches.expiryDate,
      createdAt: batches.createdAt,
      unitCost: batches.unitCost,
      quantityReceived: batches.quantityReceived,
    };

    const col = params.sortBy ? ALLOWED_SORT_FIELDS[params.sortBy] : undefined;
    const orderCol = col || batches.expiryDate;

    const baseQuery = this.databaseService.db
      .select()
      .from(batches)
      .where(whereClause)
      .orderBy(params.sortOrder === 'desc' ? sql`${orderCol} desc` : asc(orderCol));

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
      .select()
      .from(batches)
      .where(eq(batches.id, id))
      .limit(1);
    return result[0] || null;
  }

  async create(data: {
    itemId: string;
    grnId: string;
    batchNo: string;
    expiryDate: string;
    unitCost: number;
    sellingPrice: number;
    quantityReceived: number;
  }) {
    const [row] = await this.databaseService.db
      .insert(batches)
      .values({
        ...data,
        unitCost: String(data.unitCost),
        sellingPrice: String(data.sellingPrice),
      })
      .returning();
    return row;
  }

  async updateQrCodeUrl(id: string, qrCodeUrl: string) {
    await this.databaseService.db
      .update(batches)
      .set({ qrCodeUrl })
      .where(eq(batches.id, id));
  }
}
