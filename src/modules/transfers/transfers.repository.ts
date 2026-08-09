import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { transfers, batches, stockMovements, items, locations, users } from '../../db';
import { eq, and, sql, SQL, gte, lt, gt, count, or, desc, asc } from 'drizzle-orm';
import { paginate, PaginatedResponse } from '../../common/pagination';

@Injectable()
export class TransfersRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findLocationsByBranch(branchId: string) {
    return this.databaseService.db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.branchId, branchId));
  }

  async findLocationNameById(locationId: string): Promise<string | null> {
    const result = await this.databaseService.db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    return result[0]?.name ?? null;
  }

  async findUserNameById(userId: string): Promise<string | null> {
    const result = await this.databaseService.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return result[0]?.name ?? null;
  }

  async findBatchById(batchId: string) {
    const result = await this.databaseService.db
      .select()
      .from(batches)
      .where(eq(batches.id, batchId))
      .limit(1);
    return result[0] ?? null;
  }

  async getFefoSuggestions(
    itemId: string,
    locationId: string,
    quantityNeeded: number,
  ) {
    const today = new Date().toISOString().split('T')[0];

    const results = await this.databaseService.db
      .select({
        batchId: batches.id,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        availableQuantity: sql<number>`
          coalesce(sum(${stockMovements.quantity}), 0)
        `,
      })
      .from(batches)
      .innerJoin(stockMovements, eq(batches.id, stockMovements.batchId))
      .where(
        and(
          eq(batches.itemId, itemId),
          eq(stockMovements.locationId, locationId),
          gte(batches.expiryDate, today),
        ),
      )
      .groupBy(batches.id, batches.batchNo, batches.expiryDate)
      .having(sql`coalesce(sum(${stockMovements.quantity}), 0) > 0`)
      .orderBy(sql`${batches.expiryDate} asc`);

    return results.map((r) => {
      const expiryDate = new Date(r.expiryDate);
      const now = new Date();
      const diffMs = expiryDate.getTime() - now.getTime();
      const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return {
        batchId: r.batchId,
        batchNo: r.batchNo,
        expiryDate: r.expiryDate,
        availableQuantity: r.availableQuantity,
        daysUntilExpiry,
      };
    });
  }

  async create(data: {
    batchId: string;
    quantity: number;
    fromLocationId: string;
    toLocationId: string;
    transferredBy: string;
  }) {
    const [row] = await this.databaseService.db
      .insert(transfers)
      .values(data)
      .returning();
    return row;
  }

  async findById(transferId: string) {
    const result = await this.databaseService.db
      .select({
        id: transfers.id,
        batchId: transfers.batchId,
        quantity: transfers.quantity,
        fromLocationId: transfers.fromLocationId,
        toLocationId: transfers.toLocationId,
        transferredBy: transfers.transferredBy,
        createdAt: transfers.createdAt,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        itemName: items.name,
        itemId: items.id,
        fromLocationName: locations.name,
      })
      .from(transfers)
      .innerJoin(batches, eq(transfers.batchId, batches.id))
      .innerJoin(items, eq(batches.itemId, items.id))
      .innerJoin(locations, eq(transfers.fromLocationId, locations.id))
      .where(eq(transfers.id, transferId))
      .limit(1);

    if (result.length === 0) return null;

    const toLocation = await this.databaseService.db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, result[0].toLocationId))
      .limit(1);

    return {
      ...result[0],
      toLocationName: toLocation[0]?.name ?? 'Unknown',
    };
  }

  async findAll(params: {
    page: number;
    limit: number;
    batchId?: string;
    itemId?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const conditions: SQL[] = [];

    if (params.batchId) {
      conditions.push(eq(transfers.batchId, params.batchId));
    }
    if (params.itemId) {
      conditions.push(eq(batches.itemId, params.itemId));
    }
    if (params.fromDate) {
      conditions.push(gte(transfers.createdAt, new Date(params.fromDate)));
    }
    if (params.toDate) {
      const nextDay = new Date(params.toDate);
      nextDay.setDate(nextDay.getDate() + 1);
      conditions.push(lt(transfers.createdAt, nextDay));
    }
    if (params.search) {
      conditions.push(
        or(
          sql`${batches.batchNo} ILIKE ${`%${params.search}%`}`,
          sql`${items.name} ILIKE ${`%${params.search}%`}`,
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(transfers)
      .innerJoin(batches, eq(transfers.batchId, batches.id))
      .innerJoin(items, eq(batches.itemId, items.id))
      .where(whereClause);

    const ALLOWED_SORT_FIELDS: Record<string, any> = {
      createdAt: transfers.createdAt,
      quantity: transfers.quantity,
      itemName: items.name,
      batchNo: batches.batchNo,
    };

    const col = params.sortBy ? ALLOWED_SORT_FIELDS[params.sortBy] : undefined;
    const orderCol = col || transfers.createdAt;

    const baseQuery = this.databaseService.db
      .select({
        id: transfers.id,
        batchId: transfers.batchId,
        quantity: transfers.quantity,
        fromLocationId: transfers.fromLocationId,
        toLocationId: transfers.toLocationId,
        transferredBy: transfers.transferredBy,
        createdAt: transfers.createdAt,
        batchNo: batches.batchNo,
        itemName: items.name,
        itemId: items.id,
        fromLocationName: locations.name,
      })
      .from(transfers)
      .innerJoin(batches, eq(transfers.batchId, batches.id))
      .innerJoin(items, eq(batches.itemId, items.id))
      .innerJoin(locations, eq(transfers.fromLocationId, locations.id))
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
