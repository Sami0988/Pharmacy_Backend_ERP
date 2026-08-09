import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { items } from '../../db';
import { and, eq, or, ne, isNull, sql, SQL, desc, asc, count } from 'drizzle-orm';
import { paginate, PaginatedResponse } from '../../common/pagination';

@Injectable()
export class ItemsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(params: {
    search?: string;
    category?: string;
    includeDeleted?: boolean;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const conditions: SQL[] = [];

    if (!params.includeDeleted) {
      conditions.push(isNull(items.deletedAt));
    }
    if (params.search) {
      const nameSimilarity = sql`similarity(${items.name}, ${params.search})`;
      const genericNameSimilarity = sql`similarity(${items.genericName}, ${params.search})`;
      conditions.push(
        sql`(${nameSimilarity} > 0.1 OR ${genericNameSimilarity} > 0.1)`,
      );
    }
    if (params.category) {
      conditions.push(eq(items.category, params.category));
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const countQuery = this.databaseService.db
      .select({ count: count() })
      .from(items)
      .where(whereClause);

    const ALLOWED_SORT_FIELDS: Record<string, any> = {
      name: items.name,
      category: items.category,
      createdAt: items.createdAt,
    };

    const orderByParts: SQL[] = [];
    if (params.search) {
      const nameSimilarity = sql`similarity(${items.name}, ${params.search})`;
      const genericNameSimilarity = sql`similarity(${items.genericName}, ${params.search})`;
      const maxSimilarity = sql`GREATEST(${nameSimilarity}, ${genericNameSimilarity})`;
      orderByParts.push(desc(maxSimilarity));
    } else if (params.sortBy && ALLOWED_SORT_FIELDS[params.sortBy]) {
      const col = ALLOWED_SORT_FIELDS[params.sortBy];
      orderByParts.push(params.sortOrder === 'asc' ? asc(col) : desc(col));
    } else {
      orderByParts.push(desc(items.createdAt));
    }

    const baseQuery = this.databaseService.db
      .select()
      .from(items)
      .where(whereClause)
      .orderBy(...orderByParts);

    return paginate<any>({
      db: this.databaseService.db,
      baseQuery,
      countQuery,
      page: params.page,
      limit: params.limit,
    });
  }

  async findById(id: string, includeDeleted = false) {
    const conditions: SQL[] = [eq(items.id, id)];
    if (!includeDeleted) {
      conditions.push(isNull(items.deletedAt));
    }
    const result = await this.databaseService.db
      .select()
      .from(items)
      .where(and(...conditions))
      .limit(1);
    return result[0] || null;
  }

  async create(data: typeof items.$inferInsert) {
    const [created] = await this.databaseService.db
      .insert(items)
      .values(data)
      .returning();
    return created;
  }

  async update(id: string, data: Partial<typeof items.$inferInsert>) {
    const [updated] = await this.databaseService.db
      .update(items)
      .set(data)
      .where(eq(items.id, id))
      .returning();
    return updated;
  }

  async softDelete(id: string) {
    const [deleted] = await this.databaseService.db
      .update(items)
      .set({ deletedAt: new Date() })
      .where(eq(items.id, id))
      .returning();
    return deleted;
  }

  async findSubstitutes(itemId: string, genericName: string) {
    return this.databaseService.db
      .select({
        id: items.id,
        name: items.name,
        genericName: items.genericName,
        strength: items.strength,
        unit: items.unit,
      })
      .from(items)
      .where(
        and(
          eq(items.genericName, genericName),
          ne(items.id, itemId),
          eq(items.isControlledSubstance, false),
          isNull(items.deletedAt),
        ),
      );
  }
}
