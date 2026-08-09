import { Injectable } from '@nestjs/common';
import { StockMovementsRepository } from './stock-movements.repository';

@Injectable()
export class StockMovementsService {
  constructor(private readonly repository: StockMovementsRepository) {}

  async record(params: {
    batchId: string;
    locationId: string;
    type: string;
    quantity: number;
    refId?: string;
    refType?: string;
    createdBy: string;
  }) {
    return this.repository.record(params);
  }

  async getCurrentQuantity(
    batchId: string,
    locationId: string,
  ): Promise<number> {
    return this.repository.getCurrentQuantity(batchId, locationId);
  }

  async getBatchQuantitiesByLocation(batchId: string) {
    return this.repository.getBatchQuantitiesByLocation(batchId);
  }
}
