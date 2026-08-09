import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { notifications } from '../../db';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { paginate, PaginatedResponse } from '../../common/pagination';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(data: {
    type: string;
    title: string;
    message: string;
    itemId?: string;
    batchId?: string;
    thresholdDays?: number;
  }) {
    const [row] = await this.databaseService.db
      .insert(notifications)
      .values({
        type: data.type as any,
        title: data.title,
        message: data.message,
        itemId: data.itemId ?? null,
        batchId: data.batchId ?? null,
        thresholdDays: data.thresholdDays ?? null,
      })
      .returning();
    return row;
  }

  async findExistingUnread(type: string, identifierColumn: 'itemId' | 'batchId', identifierValue: string) {
    const col = identifierColumn === 'itemId' ? notifications.itemId : notifications.batchId;
    const result = await this.databaseService.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.type, type as any),
          eq(col, identifierValue),
          eq(notifications.isRead, false),
        ),
      )
      .limit(1);
    return result.length > 0;
  }

  async findExistingUnreadWithThreshold(type: string, batchId: string, thresholdDays: number) {
    const result = await this.databaseService.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.type, type as any),
          eq(notifications.batchId, batchId),
          eq(notifications.thresholdDays, thresholdDays),
          eq(notifications.isRead, false),
        ),
      )
      .limit(1);
    return result.length > 0;
  }

  async findAll(params: {
    type?: string;
    isRead?: boolean;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<any>> {
    const conditions: any[] = [];
    if (params.type) {
      conditions.push(eq(notifications.type, params.type as any));
    }
    if (params.isRead !== undefined) {
      conditions.push(eq(notifications.isRead, params.isRead));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(notifications)
      .where(where);

    const baseQuery = this.databaseService.db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt));

    return paginate<any>({
      db: this.databaseService.db,
      baseQuery,
      countQuery,
      page: params.page,
      limit: params.limit,
    });
  }

  async countUnread() {
    const result = await this.databaseService.db
      .select({ count: count() })
      .from(notifications)
      .where(eq(notifications.isRead, false));
    return Number(result[0]?.count ?? 0);
  }

  async markAsRead(id: string) {
    const [row] = await this.databaseService.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(eq(notifications.id, id))
      .returning();
    return row;
  }

  async markAllAsRead() {
    await this.databaseService.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(eq(notifications.isRead, false));
  }

  async getSummary() {
    const result = await this.databaseService.db
      .select({
        type: notifications.type,
        count: count(),
      })
      .from(notifications)
      .where(eq(notifications.isRead, false))
      .groupBy(notifications.type);

    const summary: Record<string, number> = {
      zeroStock: 0,
      lowStock: 0,
      nearExpiry: 0,
      expired: 0,
    };

    for (const row of result) {
      switch (row.type) {
        case 'zero_stock':
          summary.zeroStock = Number(row.count);
          break;
        case 'low_stock':
          summary.lowStock = Number(row.count);
          break;
        case 'near_expiry':
          summary.nearExpiry = Number(row.count);
          break;
        case 'expired':
          summary.expired = Number(row.count);
          break;
      }
    }

    return summary;
  }
}
