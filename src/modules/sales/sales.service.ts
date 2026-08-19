import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SalesRepository } from './sales.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { TransfersService } from '../transfers/transfers.service';
import { CustomersService } from '../customers/customers.service';
import { DatabaseService } from '../../db/database.service';
import { sales, saleItems, locations, items, batches } from '../../db';
import { eq, and, ne } from 'drizzle-orm';
import { AuditLogUtil } from '../../common/utils/audit-log.util';
import { ReceiptPdfService } from '../../common/pdf/receipt-pdf.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { SaleCreatedEvent } from '../../common/events';
import { PaginatedResponse } from '../../common/pagination';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly repository: SalesRepository,
    private readonly stockMovementsService: StockMovementsService,
    private readonly transfersService: TransfersService,
    private readonly customersService: CustomersService,
    private readonly databaseService: DatabaseService,
    private readonly auditLog: AuditLogUtil,
    private readonly receiptPdfService: ReceiptPdfService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateSaleDto, userId: string, branchId: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('A sale must contain at least one item');
    }

    if (dto.paymentMethod === 'credit' && !dto.customerId) {
      throw new BadRequestException(
        'Credit sales require a customer to be attached',
      );
    }

    if (dto.customerId) {
      await this.customersService.findOne(dto.customerId);
    }

    const dispatcherLocation = await this.findDispatcherLocation(
      branchId,
    );
    if (!dispatcherLocation) {
      throw new BadRequestException(
        'No Dispatcher location found for this branch',
      );
    }
    const dispatcherLocationId = dispatcherLocation.id;

    const lineErrors: Array<{ itemIndex: number; itemId: string; message: string; substitutes?: any[] }> = [];
    const resolvedLines: Array<{
      itemId: string;
      batchId: string;
      quantity: number;
      unitPrice: number;
    }> = [];

    for (let i = 0; i < dto.items.length; i++) {
      const line = dto.items[i];
      const saleUnit = line.saleUnit ?? 'single';

      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        lineErrors.push({
          itemIndex: i,
          itemId: line.itemId,
          message: 'Quantity must be a positive integer',
        });
        continue;
      }

      const item = await this.getItemById(line.itemId);
      if (!item) {
        lineErrors.push({
          itemIndex: i,
          itemId: line.itemId,
          message: `Item ${line.itemId} not found`,
        });
        continue;
      }

      let batchId = line.batchId;

      if (!batchId) {
        const unitsNeeded = saleUnit === 'pack' ? line.quantity : line.quantity;
        const fefoResult = await this.transfersService.getFefoSuggestions(
          line.itemId,
          dispatcherLocationId,
          unitsNeeded,
        );

        if (fefoResult.suggestions.length === 0) {
          const substitutes = await this.findSubstitutes(
            line.itemId,
            dispatcherLocationId,
          );
          lineErrors.push({
            itemIndex: i,
            itemId: line.itemId,
            message: `No Dispatcher stock available for "${item.name}"`,
            substitutes,
          });
          continue;
        }

        batchId = fefoResult.suggestions[0].batchId;
      }

      const batch = await this.findBatchById(batchId);
      if (!batch) {
        lineErrors.push({
          itemIndex: i,
          itemId: line.itemId,
          message: `Batch ${batchId} not found`,
        });
        continue;
      }

      if (batch.itemId !== line.itemId) {
        lineErrors.push({
          itemIndex: i,
          itemId: line.itemId,
          message: `Batch ${batch.batchNo} does not belong to item "${item.name}"`,
        });
        continue;
      }

      const today = new Date().toISOString().split('T')[0];
      if (batch.expiryDate < today) {
        lineErrors.push({
          itemIndex: i,
          itemId: line.itemId,
          message: `Batch ${batch.batchNo} expired on ${batch.expiryDate} and cannot be sold`,
        });
        continue;
      }

      const packSize = batch.packSize ?? 1;
      const unitsToDeduct = saleUnit === 'pack' ? line.quantity * packSize : line.quantity;

      const currentQuantity =
        await this.stockMovementsService.getCurrentQuantity(
          batchId,
          dispatcherLocationId,
        );

      if (currentQuantity < unitsToDeduct) {
        lineErrors.push({
          itemIndex: i,
          itemId: line.itemId,
          message: `Insufficient stock for "${item.name}" (batch ${batch.batchNo}). Available: ${currentQuantity} units, Requested: ${unitsToDeduct} units${saleUnit === 'pack' ? ` (${line.quantity} packs × ${packSize})` : ''}`,
        });
        continue;
      }

      if (saleUnit === 'pack') {
        if (!batch.packPrice) {
          lineErrors.push({
            itemIndex: i,
            itemId: line.itemId,
            message: `Batch ${batch.batchNo} of "${item.name}" has no pack price configured`,
          });
          continue;
        }
        resolvedLines.push({
          itemId: line.itemId,
          batchId,
          quantity: unitsToDeduct,
          unitPrice: Number(batch.packPrice),
        });
      } else {
        if (!batch.sellingPrice) {
          lineErrors.push({
            itemIndex: i,
            itemId: line.itemId,
            message: `Batch ${batch.batchNo} of "${item.name}" has no selling price configured`,
          });
          continue;
        }
        resolvedLines.push({
          itemId: line.itemId,
          batchId,
          quantity: line.quantity,
          unitPrice: Number(batch.sellingPrice),
        });
      }
    }

    if (lineErrors.length > 0) {
      throw new BadRequestException({
        message: 'Some items failed validation',
        errors: lineErrors,
      });
    }

    const totalAmount = resolvedLines.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0,
    );

    const result = await this.databaseService.db.transaction(async (tx) => {
      const [sale] = await tx
        .insert(sales)
        .values({
          branchId,
          customerId: dto.customerId ?? null,
          soldBy: userId,
          totalAmount: String(totalAmount),
          paymentMethod: dto.paymentMethod,
        })
        .returning();

      const saleItemRows: Array<{ id: string; saleId: string; batchId: string; quantity: number; unitPrice: string; createdAt: Date }> = [];
      for (const line of resolvedLines) {
        const [saleItem] = await tx
          .insert(saleItems)
          .values({
            saleId: sale.id,
            batchId: line.batchId,
            quantity: line.quantity,
            unitPrice: String(line.unitPrice),
          })
          .returning();
        saleItemRows.push(saleItem);
      }

      return { sale, saleItems: saleItemRows };
    });

    for (const line of resolvedLines) {
      await this.stockMovementsService.record({
        batchId: line.batchId,
        locationId: dispatcherLocationId,
        type: 'sale',
        quantity: -line.quantity,
        refId: result.sale.id,
        refType: 'sale',
        createdBy: userId,
      });
    }

    if (dto.paymentMethod === 'credit' && dto.customerId) {
      await this.customersService['repository'].incrementCreditBalance(
        dto.customerId,
        totalAmount,
      );
    }

    let receiptUrl: string | null = null;
    try {
      const fullSale = await this.repository.findById(result.sale.id);
      receiptUrl = await this.receiptPdfService.generateReceipt(fullSale);
      await this.repository.updateReceiptUrl(result.sale.id, receiptUrl);
    } catch (error) {
      this.logger.error(
        `Receipt generation failed for sale ${result.sale.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.repository.updateReceiptUrl(result.sale.id, null);
    }

    await this.auditLog.log({
      userId,
      action: 'create_sale',
      entityType: 'sale',
      entityId: result.sale.id,
      afterData: {
        branchId,
        customerId: dto.customerId,
        totalAmount,
        paymentMethod: dto.paymentMethod,
        itemCount: resolvedLines.length,
      },
    });

    this.eventEmitter.emit(
      'sale.created',
      new SaleCreatedEvent(
        result.sale.id,
        branchId,
        totalAmount,
        userId,
      ),
    );

    return {
      ...result.sale,
      totalAmount,
      items: result.saleItems,
      receiptUrl,
    };
  }

  async createReturn(
    saleId: string,
    dto: CreateSaleReturnDto,
    userId: string,
  ) {
    const saleItem = await this.repository.findSaleItemById(dto.saleItemId);
    if (!saleItem) {
      throw new NotFoundException(`Sale item ${dto.saleItemId} not found`);
    }

    if (saleItem.saleId !== saleId) {
      throw new BadRequestException(
        `Sale item ${dto.saleItemId} does not belong to sale ${saleId}`,
      );
    }

    if (!Number.isInteger(dto.quantity) || dto.quantity <= 0) {
      throw new BadRequestException('Return quantity must be a positive integer');
    }

    const returnableQty = await this.repository.getReturnableQuantity(
      dto.saleItemId,
    );

    if (dto.quantity > returnableQty) {
      throw new BadRequestException(
        `Return quantity exceeds returnable amount. Returnable: ${returnableQty}, Requested: ${dto.quantity}`,
      );
    }

    const dispatcherLocation = await this.findDispatcherLocationBySaleId(saleId);
    if (!dispatcherLocation) {
      throw new BadRequestException(
        'No Dispatcher location found for this sale',
      );
    }

    const saleReturn = await this.repository.createSaleReturn({
      saleItemId: dto.saleItemId,
      quantity: dto.quantity,
      reason: dto.reason,
      processedBy: userId,
    });

    await this.stockMovementsService.record({
      batchId: saleItem.batchId,
      locationId: dispatcherLocation.id,
      type: 'sale_return',
      quantity: dto.quantity,
      refId: saleReturn.id,
      refType: 'sale_return',
      createdBy: userId,
    });

    await this.auditLog.log({
      userId,
      action: 'create_sale_return',
      entityType: 'sale_return',
      entityId: saleReturn.id,
      afterData: {
        saleId,
        saleItemId: dto.saleItemId,
        batchId: saleItem.batchId,
        quantity: dto.quantity,
        reason: dto.reason,
      },
    });

    return saleReturn;
  }

  async findById(id: string) {
    const sale = await this.repository.findById(id);
    if (!sale) {
      throw new NotFoundException(`Sale ${id} not found`);
    }
    return sale;
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    branchId?: string;
    customerId?: string;
    soldBy?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    return this.repository.findAll({
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      branchId: params.branchId,
      customerId: params.customerId,
      soldBy: params.soldBy,
      fromDate: params.fromDate,
      toDate: params.toDate,
      search: params.search,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    });
  }

  async getReceiptUrl(id: string) {
    const sale = await this.findById(id);
    if (!sale.receiptUrl) {
      throw new NotFoundException('No receipt available for this sale');
    }
    return this.receiptPdfService.getSignedUrl(sale.receiptUrl);
  }

  async regenerateReceipt(id: string) {
    const sale = await this.findById(id);
    try {
      const receiptUrl = await this.receiptPdfService.generateReceipt(sale);
      await this.repository.updateReceiptUrl(id, receiptUrl);
      return { receiptUrl };
    } catch (error) {
      this.logger.error(
        `Receipt regeneration failed for sale ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException('Failed to generate receipt');
    }
  }

  async hardDelete(id: string, userId: string) {
    const sale = await this.findById(id);

    // Reverse credit balance if it was a credit sale
    if (sale.paymentMethod === 'credit' && sale.customerId) {
      await this.customersService['repository'].incrementCreditBalance(
        sale.customerId,
        -Number(sale.totalAmount),
      );
    }

    const deleted = await this.repository.hardDelete(id);

    await this.auditLog.log({
      userId,
      action: 'delete_sale',
      entityType: 'sale',
      entityId: id,
      beforeData: {
        branchId: sale.branchId,
        customerId: sale.customerId,
        totalAmount: Number(sale.totalAmount),
        paymentMethod: sale.paymentMethod,
        itemCount: sale.items.length,
      },
    });

    return deleted;
  }

  async findSubstitutes(itemId: string, dispatcherLocationId: string) {
    const item = await this.getItemById(itemId);
    if (!item?.genericName) return [];

    const substituteItems = await this.databaseService.db
      .select({
        id: items.id,
        name: items.name,
        genericName: items.genericName,
      })
      .from(items)
      .where(
        and(
          eq(items.genericName, item.genericName),
          ne(items.id, itemId),
        ),
      );

    const results: Array<{ id: string; name: string; genericName: string | null; availableQuantity: number }> = [];
    for (const sub of substituteItems) {
      const qty = await this.stockMovementsService.getCurrentQuantity(
        sub.id,
        dispatcherLocationId,
      );
      if (qty > 0) {
        results.push({ ...sub, availableQuantity: qty });
      }
    }
    return results;
  }

  private async findDispatcherLocation(branchId: string) {
    const result = await this.databaseService.db
      .select()
      .from(locations)
      .where(
        and(eq(locations.branchId, branchId), eq(locations.name, 'Dispatcher')),
      )
      .limit(1);
    return result[0] ?? null;
  }

  private async findDispatcherLocationBySaleId(saleId: string) {
    const sale = await this.repository.findById(saleId);
    if (!sale) return null;
    return this.findDispatcherLocation(sale.branchId);
  }

  private async findBatchById(batchId: string) {
    const result = await this.databaseService.db
      .select()
      .from(batches)
      .where(eq(batches.id, batchId))
      .limit(1);
    return result[0] ?? null;
  }

  private async getItemById(itemId: string) {
    const result = await this.databaseService.db
      .select()
      .from(items)
      .where(eq(items.id, itemId))
      .limit(1);
    return result[0] ?? null;
  }
}
