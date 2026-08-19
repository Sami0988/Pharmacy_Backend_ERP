import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TransfersRepository } from './transfers.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { DatabaseService } from '../../db/database.service';
import { transfers, stockMovements } from '../../db';
import { AuditLogUtil } from '../../common/utils/audit-log.util';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferCompletedEvent } from '../../common/events';
import { PaginatedResponse } from '../../common/pagination';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly repository: TransfersRepository,
    private readonly stockMovementsService: StockMovementsService,
    private readonly databaseService: DatabaseService,
    private readonly auditLog: AuditLogUtil,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getFefoSuggestions(
    itemId: string,
    locationId: string | undefined,
    quantityNeeded: number,
    branchId?: string | null,
  ) {
    if (!locationId) {
      if (!branchId) {
        throw new BadRequestException(
          'locationId is required when branchId is not available',
        );
      }
      const locations = await this.repository.findLocationsByBranch(branchId);
      const store = locations.find((l) => l.name === 'Store');
      if (!store) {
        throw new BadRequestException('Store location not found for your branch');
      }
      locationId = store.id;
    }

    const suggestions = await this.repository.getFefoSuggestions(
      itemId,
      locationId,
      quantityNeeded,
    );

    const totalAvailable = suggestions.reduce(
      (sum, s) => sum + s.availableQuantity,
      0,
    );

    return {
      itemId,
      locationId,
      quantityNeeded,
      suggestions,
      totalAvailable,
    };
  }

  async create(dto: CreateTransferDto, userId: string, branchId?: string | null) {
    let fromLocationId = dto.fromLocationId;
    let toLocationId = dto.toLocationId;

    if (!fromLocationId || !toLocationId) {
      if (!branchId) {
        throw new BadRequestException(
          'branchId is required when fromLocationId/toLocationId are not provided',
        );
      }

      const locations = await this.repository.findLocationsByBranch(branchId);
      const store = locations.find((l) => l.name === 'Store');
      const dispatcher = locations.find((l) => l.name === 'Dispatcher');

      if (!store || !dispatcher) {
        throw new BadRequestException(
          'Store and Dispatcher locations not found for your branch',
        );
      }

      fromLocationId = fromLocationId ?? store.id;
      toLocationId = toLocationId ?? dispatcher.id;
    }

    if (fromLocationId === toLocationId) {
      throw new BadRequestException(
        'Source and destination locations must be different',
      );
    }

    const hasPacks = dto.numberOfPacks !== undefined && dto.numberOfPacks !== null;
    const hasQty = dto.quantity !== undefined && dto.quantity !== null;

    if (!hasPacks && !hasQty) {
      throw new BadRequestException('Either numberOfPacks or quantity must be provided');
    }

    if (hasPacks && hasQty) {
      throw new BadRequestException('Only one of numberOfPacks or quantity can be provided, not both');
    }

    const batch = await this.repository.findBatchById(dto.batchId);
    if (!batch) {
      throw new NotFoundException(`Batch ${dto.batchId} not found`);
    }

    const today = new Date().toISOString().split('T')[0];
    if (batch.expiryDate < today) {
      throw new BadRequestException(
        `This batch expired on ${batch.expiryDate} and cannot be transferred`,
      );
    }

    const packSize = batch.packSize ?? 1;
    let transferQuantity: number;
    let numberOfPacks: number;

    if (hasPacks) {
      if (!Number.isInteger(dto.numberOfPacks) || dto.numberOfPacks <= 0) {
        throw new BadRequestException('Number of packs must be a positive integer');
      }
      numberOfPacks = dto.numberOfPacks;
      transferQuantity = numberOfPacks * packSize;
    } else {
      if (!Number.isInteger(dto.quantity) || dto.quantity <= 0) {
        throw new BadRequestException('Quantity must be a positive integer');
      }
      transferQuantity = dto.quantity;
      numberOfPacks = Math.floor(transferQuantity / packSize);
    }

    const currentQuantity = await this.stockMovementsService.getCurrentQuantity(
      dto.batchId,
      fromLocationId,
    );

    if (currentQuantity < transferQuantity) {
      throw new BadRequestException(
        `Insufficient stock at source location. Available: ${currentQuantity} units, Requested: ${transferQuantity} units (${dto.numberOfPacks} packs × ${packSize} units/pack)`,
      );
    }

    const result = await this.databaseService.db.transaction(async (tx) => {
      const [transferRow] = await tx
        .insert(transfers)
        .values({
          batchId: dto.batchId,
          quantity: transferQuantity,
          fromLocationId,
          toLocationId,
          transferredBy: userId,
        })
        .returning();

      await tx.insert(stockMovements).values({
        batchId: dto.batchId,
        locationId: fromLocationId,
        type: 'transfer_out',
        quantity: -transferQuantity,
        refId: transferRow.id,
        refType: 'transfer',
        createdBy: userId,
      });

      await tx.insert(stockMovements).values({
        batchId: dto.batchId,
        locationId: toLocationId,
        type: 'transfer_in',
        quantity: transferQuantity,
        refId: transferRow.id,
        refType: 'transfer',
        createdBy: userId,
      });

      return transferRow;
    });

    const quantities =
      await this.stockMovementsService.getBatchQuantitiesByLocation(
        dto.batchId,
      );

    await this.auditLog.log({
      userId,
      action: 'create_transfer',
      entityType: 'transfer',
      entityId: result.id,
      afterData: {
        batchId: dto.batchId,
        numberOfPacks,
        packSize,
        transferQuantity,
        fromLocationId,
        toLocationId,
      },
    });

    this.eventEmitter.emit(
      'transfer.completed',
      new TransferCompletedEvent(
        result.id,
        dto.batchId,
        fromLocationId,
        toLocationId,
        transferQuantity,
      ),
    );

    return {
      ...result,
      numberOfPacks,
      packSize,
      transferQuantity,
      quantities,
    };
  }

  async findById(transferId: string) {
    return this.repository.findById(transferId);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    batchId?: string;
    itemId?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const result = await this.repository.findAll({
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      batchId: params.batchId,
      itemId: params.itemId,
      fromDate: params.fromDate,
      toDate: params.toDate,
      search: params.search,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    });

    const resolvedData = await Promise.all(
      result.data.map(async (row) => {
        const [toLocation, transferredByUser] = await Promise.all([
          this.repository.findLocationNameById(row.toLocationId),
          this.repository.findUserNameById(row.transferredBy),
        ]);
        return {
          ...row,
          toLocationName: toLocation ?? 'Unknown',
          transferredByName: transferredByUser ?? 'Unknown',
          transferDate: row.createdAt,
        };
      }),
    );

    return { ...result, data: resolvedData };
  }
}
