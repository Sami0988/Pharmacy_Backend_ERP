import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { stockMovements, batches } from '../../db';
import { eq, and, sql } from 'drizzle-orm';

@Injectable()
export class StockMovementsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async record(params: {
    batchId: string;
    locationId: string;
    type: string;
    quantity: number;
    refId?: string;
    refType?: string;
    createdBy: string;
  }) {
    // Prevent negative stock: if this is a deduction, check current quantity
    if (params.quantity < 0) {
      const currentQty = await this.getCurrentQuantity(
        params.batchId,
        params.locationId,
      );
      if (currentQty + params.quantity < 0) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${currentQty}, Attempted deduction: ${Math.abs(params.quantity)}`,
        );
      }
    }

    const [row] = await this.databaseService.db
      .insert(stockMovements)
      .values({
        batchId: params.batchId,
        locationId: params.locationId,
        type: params.type as any,
        quantity: params.quantity,
        refId: params.refId ?? null,
        refType: params.refType ?? null,
        createdBy: params.createdBy,
      })
      .returning();
    return row;
  }

  async getCurrentQuantity(
    batchId: string,
    locationId: string,
  ): Promise<number> {
    const result = await this.databaseService.db
      .select({
        total: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.batchId, batchId),
          eq(stockMovements.locationId, locationId),
        ),
      );
    return Number(result[0]?.total ?? 0);
  }

  async getBatchQuantitiesByLocation(batchId: string) {
    const result = await this.databaseService.db
      .select({
        locationId: stockMovements.locationId,
        quantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
        packSize: batches.packSize,
      })
      .from(stockMovements)
      .innerJoin(batches, eq(stockMovements.batchId, batches.id))
      .where(eq(stockMovements.batchId, batchId))
      .groupBy(stockMovements.locationId, batches.packSize);
    return result;
  }

  async adjustStock(params: {
    batchId: string;
    locationId: string;
    newQuantity: number;
    reason: string;
    createdBy: string;
  }) {
    const currentQty = await this.getCurrentQuantity(
      params.batchId,
      params.locationId,
    );

    const delta = params.newQuantity - currentQty;

    if (delta === 0) {
      return { currentQty, delta: 0, message: 'Stock already at target quantity' };
    }

    const [row] = await this.databaseService.db
      .insert(stockMovements)
      .values({
        batchId: params.batchId,
        locationId: params.locationId,
        type: 'adjustment',
        quantity: delta,
        refType: 'adjustment',
        reason: params.reason,
        createdBy: params.createdBy,
      })
      .returning();

    return { movement: row, previousQty: currentQty, newQty: params.newQuantity, delta };
  }
}
