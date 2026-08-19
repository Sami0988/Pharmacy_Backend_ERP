import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { batches, stockMovements, items } from '../../db';
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
      const searchTerm = `%${params.search}%`;
      conditions.push(
        sql`(
          ${batches.batchNo} ILIKE ${searchTerm}
          OR ${items.name} ILIKE ${searchTerm}
          OR ${items.genericName} ILIKE ${searchTerm}
        )`,
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
      .innerJoin(items, eq(batches.itemId, items.id))
      .where(whereClause);

    const ALLOWED_SORT_FIELDS: Record<string, any> = {
      batchNo: batches.batchNo,
      expiryDate: batches.expiryDate,
      createdAt: batches.createdAt,
      unitCost: batches.unitCost,
      quantityReceived: batches.quantityReceived,
      itemName: items.name,
    };

    const col = params.sortBy ? ALLOWED_SORT_FIELDS[params.sortBy] : undefined;
    const orderCol = col || batches.expiryDate;

    const baseQuery = this.databaseService.db
      .select({
        id: batches.id,
        itemId: batches.itemId,
        grnId: batches.grnId,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        packSize: batches.packSize,
        unitCost: batches.unitCost,
        sellingPrice: batches.sellingPrice,
        packPrice: batches.packPrice,
        quantityReceived: batches.quantityReceived,
        qrCodeUrl: batches.qrCodeUrl,
        createdAt: batches.createdAt,
        itemName: items.name,
        genericName: items.genericName,
        quantities: sql<string>`COALESCE(
          (SELECT json_agg(json_build_object('locationId', sm.location_id, 'quantity', sm.total))
           FROM (SELECT sm2.location_id, SUM(sm2.quantity) as total
                 FROM stock_movements sm2
                 WHERE sm2.batch_id = ${batches.id}
                 GROUP BY sm2.location_id) sm), '[]'
        )`,
      })
      .from(batches)
      .innerJoin(items, eq(batches.itemId, items.id))
      .where(whereClause)
      .orderBy(
        params.search
          ? sql`CASE WHEN ${items.name} ILIKE ${`%${params.search}%`} THEN 0 WHEN ${items.genericName} ILIKE ${`%${params.search}%`} THEN 1 ELSE 2 END, ${orderCol} asc`
          : params.sortOrder === 'desc' ? sql`${orderCol} desc` : asc(orderCol)
      );

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

  async findByBatchNo(batchNo: string) {
    const result = await this.databaseService.db
      .select()
      .from(batches)
      .where(eq(batches.batchNo, batchNo))
      .limit(1);
    return result[0] || null;
  }

  async findExistingBatchNos(batchNos: string[]) {
    if (batchNos.length === 0) return [];
    const result = await this.databaseService.db
      .select({ batchNo: batches.batchNo })
      .from(batches)
      .where(sql`${batches.batchNo} IN ${batchNos}`);
    return result.map((r) => r.batchNo);
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

  async update(id: string, data: {
    batchNo?: string;
    expiryDate?: string;
    packSize?: number;
    unitCost?: number;
    sellingPrice?: number;
    packPrice?: string | null;
    quantityReceived?: number;
  }) {
    const updateData: Record<string, any> = {};
    if (data.batchNo !== undefined) updateData.batchNo = data.batchNo;
    if (data.expiryDate !== undefined) updateData.expiryDate = data.expiryDate;
    if (data.packSize !== undefined) updateData.packSize = data.packSize;
    if (data.unitCost !== undefined) updateData.unitCost = String(data.unitCost);
    if (data.sellingPrice !== undefined) updateData.sellingPrice = String(data.sellingPrice);
    if (data.packPrice !== undefined) updateData.packPrice = data.packPrice;
    if (data.quantityReceived !== undefined) updateData.quantityReceived = data.quantityReceived;

    if (Object.keys(updateData).length === 0) return null;

    const [updated] = await this.databaseService.db
      .update(batches)
      .set(updateData)
      .where(eq(batches.id, id))
      .returning();
    return updated;
  }

  async findExistingBatchNosExcept(batchNos: string[], excludeIds: string[]) {
    if (batchNos.length === 0) return [];
    const result = await this.databaseService.db
      .select({ batchNo: batches.batchNo })
      .from(batches)
      .where(
        sql`${batches.batchNo} IN ${batchNos} AND ${batches.id} NOT IN ${excludeIds}`
      );
    return result.map((r) => r.batchNo);
  }
}
