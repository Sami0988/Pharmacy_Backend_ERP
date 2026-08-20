import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as QRCode from 'qrcode';
import { GoodsReceiptsRepository } from './goods-receipts.repository';
import { BatchesRepository } from '../batches/batches.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { MinioService } from '../../common/storage/minio.service';
import { AuditLogUtil } from '../../common/utils/audit-log.util';
import { DatabaseService } from '../../db/database.service';
import { locations, goodsReceipts, batches, stockMovements } from '../../db';
import { eq } from 'drizzle-orm';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import { PaginatedResponse } from '../../common/pagination';

@Injectable()
export class GoodsReceiptsService {
  private readonly logger = new Logger(GoodsReceiptsService.name);

  constructor(
    private readonly repository: GoodsReceiptsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly stockMovementsService: StockMovementsService,
    private readonly minioService: MinioService,
    private readonly auditLog: AuditLogUtil,
    private readonly databaseService: DatabaseService,
  ) {}

  async create(
    dto: CreateGoodsReceiptDto,
    file: Express.Multer.File | undefined,
    userId: string,
    branchId: string,
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('A GRN must contain at least one item');
    }

    const now = new Date();
    for (const item of dto.items) {
      if (new Date(item.expiryDate) <= now) {
        throw new BadRequestException(
          `Batch ${item.batchNo}: expiry date must be in the future`,
        );
      }
      if (!item.numberOfPacks || item.numberOfPacks <= 0) {
        throw new BadRequestException(
          `Batch ${item.batchNo}: numberOfPacks must be positive`,
        );
      }
      if (!item.packSize || item.packSize <= 0) {
        throw new BadRequestException(
          `Batch ${item.batchNo}: packSize must be positive`,
        );
      }
      if (item.unitCost <= 0) {
        throw new BadRequestException(
          `Batch ${item.batchNo}: unit cost must be positive`,
        );
      }
      if (item.sellingPrice === undefined && item.markupPercentage === undefined) {
        throw new BadRequestException(
          `Batch ${item.batchNo}: either sellingPrice or markupPercentage is required`,
        );
      }
      if (item.sellingPrice !== undefined && item.markupPercentage !== undefined) {
        throw new BadRequestException(
          `Batch ${item.batchNo}: provide either sellingPrice or markupPercentage, not both`,
        );
      }
      const costPerUnit = item.unitCost / item.packSize;
      if (item.sellingPrice !== undefined && item.sellingPrice < costPerUnit) {
        throw new BadRequestException(
          `Batch ${item.batchNo}: selling price (${item.sellingPrice}) cannot be less than per-unit cost (${costPerUnit})`,
        );
      }
    }

    let grnNumber = dto.grnNumber?.trim();
    if (!grnNumber) {
      grnNumber = await this.generateUniqueGrnNumber(dto.supplierId);
    }

    const exists = await this.repository.findByGrnNumberAndSupplier(
      grnNumber,
      dto.supplierId,
    );
    if (exists) {
      throw new ConflictException(
        `GRN number "${grnNumber}" already exists for this supplier`,
      );
    }

    const batchNos = dto.items.map((item) => item.batchNo);
    const existingBatchNos = await this.batchesRepository.findExistingBatchNos(batchNos);
    if (existingBatchNos.length > 0) {
      throw new ConflictException(
        `Batch number(s) already exist: ${existingBatchNos.join(', ')}`,
      );
    }

    let invoiceKey: string | undefined;
    let invoiceUrl: string | undefined;
    if (file) {
      try {
        const ext = this.getFileExtension(file.originalname);
        invoiceKey = `invoices/${dto.supplierId}/${grnNumber}.${ext}`;
        invoiceUrl = await this.minioService.uploadFile(
          'invoices',
          invoiceKey,
          file.buffer,
          file.mimetype,
        );
      } catch (error) {
        this.logger.error(
          `Failed to upload invoice: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new ServiceUnavailableException(
          'Failed to upload invoice document',
        );
      }
    }

    const totalCost = dto.items.reduce(
      (sum, item) => sum + item.numberOfPacks * item.packSize * item.unitCost,
      0,
    );

    const taxPaid = dto.taxPaid ?? false;
    const paymentDueDateType = dto.paymentDueDateType ?? 'one_month';
    const paymentMethod = dto.paymentMethod ?? 'cash';
    const paymentDueDate =
      paymentDueDateType === 'other'
        ? dto.paymentDueDate
        : this.calculatePaymentDueDate(dto.receiptDate, paymentDueDateType);

    try {
      const grn = await this.databaseService.db.transaction(async (tx) => {
        const [grnRow] = await tx
          .insert(goodsReceipts)
          .values({
            supplierId: dto.supplierId,
            branchId,
            grnNumber,
            receiptDate: dto.receiptDate,
            invoiceDocumentUrl: invoiceUrl,
            totalCost: String(totalCost),
            taxPaid,
            paymentDueDate,
            paymentDueDateType,
            paymentMethod,
            createdBy: userId,
          })
          .returning();

        const storeLocation = await tx
          .select()
          .from(locations)
          .where(eq(locations.branchId, branchId))
          .limit(1);

        if (storeLocation.length === 0) {
          throw new Error('No store location found for this branch');
        }
        const storeLocationId = storeLocation[0].id;

        for (const item of dto.items) {
          const totalUnits = item.numberOfPacks * item.packSize;
          const costPerUnit = item.unitCost / item.packSize;
          const sellingPrice =
            item.sellingPrice !== undefined
              ? item.sellingPrice
              : Math.round(costPerUnit * (1 + item.markupPercentage! / 100) * 100) / 100;

          const [batch] = await tx
            .insert(batches)
            .values({
              itemId: item.itemId,
              grnId: grnRow.id,
              batchNo: item.batchNo,
              expiryDate: item.expiryDate,
              packSize: item.packSize,
              unitCost: String(costPerUnit),
              sellingPrice: String(sellingPrice),
              packPrice: item.packPrice != null ? String(item.packPrice) : null,
              quantityReceived: totalUnits,
            })
            .returning();

          await tx.insert(stockMovements).values({
            batchId: batch.id,
            locationId: storeLocationId,
            type: 'receipt',
            quantity: totalUnits,
            refId: grnRow.id,
            refType: 'goods_receipt',
            createdBy: userId,
          });
        }

        return grnRow;
      });

      const grnBatches = await this.databaseService.db
        .select()
        .from(batches)
        .where(eq(batches.grnId, grn.id));

      for (const batch of grnBatches) {
        try {
          const qrBuffer = await QRCode.toBuffer(batch.id);
          const qrKey = `batch-qr-codes/${batch.id}.png`;
          await this.minioService.uploadFile(
            'batch-qr-codes',
            qrKey,
            qrBuffer,
            'image/png',
          );
          await this.batchesRepository.updateQrCodeUrl(batch.id, qrKey);
        } catch (error) {
          this.logger.warn(
            `Failed to generate QR code for batch ${batch.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      await this.auditLog.log({
        userId,
        action: 'CREATE_GOODS_RECEIPT',
        entityType: 'goods_receipt',
        entityId: grn.id,
        afterData: { ...dto, totalCost, items: dto.items.length },
      });

      return this.findById(grn.id);
    } catch (error) {
      if (invoiceKey) {
        try {
          await this.minioService.deleteFile('invoices', invoiceKey);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  }

  async findAll(params: {
    supplierId?: string;
    supplier?: string;
    branchId?: string;
    search?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    return this.repository.findAll(params);
  }

  async findById(id: string) {
    const grn = await this.repository.findById(id);
    if (!grn) {
      throw new NotFoundException(`Goods receipt ${id} not found`);
    }
    if (grn.invoiceDocumentUrl && !grn.invoiceDocumentUrl.startsWith('http')) {
      grn.invoiceDocumentUrl = await this.minioService.getSignedUrl('invoices', grn.invoiceDocumentUrl);
    }
    return grn;
  }

  async getInvoiceUrl(id: string) {
    const grn = await this.findById(id);
    if (!grn.invoiceDocumentUrl) {
      throw new NotFoundException('No invoice document attached');
    }
    return this.minioService.getSignedUrl('invoices', grn.invoiceDocumentUrl);
  }

  async remove(id: string, userId: string) {
    const grn = await this.findById(id);

    const deleted = await this.repository.hardDelete(id);
    if (!deleted) {
      throw new NotFoundException(`Goods receipt ${id} not found`);
    }

    if (grn.invoiceDocumentUrl && !grn.invoiceDocumentUrl.startsWith('http')) {
      try {
        await this.minioService.deleteFile('invoices', grn.invoiceDocumentUrl);
      } catch {
        // Ignore cleanup errors
      }
    }

    await this.auditLog.log({
      userId,
      action: 'DELETE_GOODS_RECEIPT',
      entityType: 'goods_receipt',
      entityId: id,
      beforeData: { grnNumber: grn.grnNumber, totalCost: grn.totalCost },
    });

    return { message: 'Goods receipt deleted successfully' };
  }

  async removeItem(grnId: string, batchId: string, userId: string) {
    await this.findById(grnId);

    const result = await this.repository.removeItemFromGrn(grnId, batchId);

    if (result.error === 'GRN_NOT_FOUND') {
      throw new NotFoundException(`Goods receipt ${grnId} not found`);
    }
    if (result.error === 'BATCH_NOT_FOUND') {
      throw new BadRequestException(`Batch ${batchId} does not belong to goods receipt ${grnId}`);
    }

    await this.auditLog.log({
      userId,
      action: 'REMOVE_ITEM_FROM_GOODS_RECEIPT',
      entityType: 'goods_receipt',
      entityId: grnId,
      beforeData: { batchId, previousTotalCost: result.previousTotalCost },
      afterData: { newTotalCost: result.newTotalCost },
    });

    return result;
  }

  async update(
    id: string,
    dto: UpdateGoodsReceiptDto,
    file: Express.Multer.File | undefined,
    userId: string,
  ) {
    const grn = await this.findById(id);
    const grnBatches = await this.repository.getBatchesByGrnId(id);

    if (!grnBatches || grnBatches.length === 0) {
      throw new BadRequestException('This GRN has no batches to edit');
    }

    if (dto.items && dto.items.length > 0) {
      for (const itemDto of dto.items) {
        const batch = grnBatches.find((b) => b.id === itemDto.batchId);
        if (!batch) {
          throw new BadRequestException(
            `Batch ${itemDto.batchId} does not belong to GRN ${id}`,
          );
        }

        if (itemDto.batchNo && itemDto.batchNo !== batch.batchNo) {
          const duplicateBatch = await this.batchesRepository.findExistingBatchNos([itemDto.batchNo]);
          if (duplicateBatch.length > 0) {
            throw new ConflictException(
              `Batch number "${itemDto.batchNo}" already exists`,
            );
          }
        }

        if (itemDto.expiryDate) {
          const now = new Date();
          if (new Date(itemDto.expiryDate) <= now) {
            throw new BadRequestException(
              `Batch ${batch.batchNo}: expiry date must be in the future`,
            );
          }
        }

        if (
          itemDto.numberOfPacks !== undefined ||
          itemDto.packSize !== undefined
        ) {
          const newNumberOfPacks = itemDto.numberOfPacks ?? (batch.quantityReceived / batch.packSize);
          const newPackSize = itemDto.packSize ?? batch.packSize;
          const newTotalUnits = newNumberOfPacks * newPackSize;

          const soldQty = await this.repository.getSoldQuantityForBatch(batch.id);
          const transferredQty = await this.repository.getTransferredQuantityForBatch(batch.id);
          const consumedQty = soldQty + transferredQty;

          if (newTotalUnits < consumedQty) {
            throw new BadRequestException(
              `Batch ${batch.batchNo}: cannot reduce quantity to ${newTotalUnits} — ${consumedQty} units have been sold/transferred (${soldQty} sold, ${transferredQty} transferred)`,
            );
          }
        }

        if (itemDto.unitCost !== undefined) {
          const soldQty = await this.repository.getSoldQuantityForBatch(batch.id);
          if (soldQty > 0) {
            throw new BadRequestException(
              `Batch ${batch.batchNo}: cannot change unit cost because ${soldQty} units have been sold`,
            );
          }
        }

        if (itemDto.sellingPrice !== undefined && itemDto.unitCost !== undefined) {
          const newPackSize = itemDto.packSize ?? batch.packSize;
          const costPerUnit = itemDto.unitCost / newPackSize;
          if (itemDto.sellingPrice < costPerUnit) {
            throw new BadRequestException(
              `Batch ${batch.batchNo}: selling price (${itemDto.sellingPrice}) cannot be less than per-unit cost (${costPerUnit})`,
            );
          }
        } else if (itemDto.sellingPrice !== undefined && itemDto.unitCost === undefined) {
          const currentCostPerUnit = Number(batch.unitCost);
          if (itemDto.sellingPrice < currentCostPerUnit) {
            throw new BadRequestException(
              `Batch ${batch.batchNo}: selling price (${itemDto.sellingPrice}) cannot be less than per-unit cost (${currentCostPerUnit})`,
            );
          }
        }
      }
    }

    let invoiceUrl = grn.invoiceDocumentUrl;
    if (file) {
      try {
        if (invoiceUrl && !invoiceUrl.startsWith('http')) {
          await this.minioService.deleteFile('invoices', invoiceUrl);
        }
        const ext = this.getFileExtension(file.originalname);
        const invoiceKey = `invoices/${grn.supplierId}/${grn.grnNumber}.${ext}`;
        invoiceUrl = await this.minioService.uploadFile(
          'invoices',
          invoiceKey,
          file.buffer,
          file.mimetype,
        );
      } catch (error) {
        this.logger.error(
          `Failed to upload invoice: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new ServiceUnavailableException('Failed to upload invoice document');
      }
    }

    await this.repository.updateGrn(id, {
      receiptDate: dto.receiptDate,
      taxPaid: dto.taxPaid,
      paymentDueDateType: dto.paymentDueDateType,
      paymentDueDate: dto.paymentDueDate,
      paymentMethod: dto.paymentMethod,
      invoiceDocumentUrl: invoiceUrl !== grn.invoiceDocumentUrl ? invoiceUrl ?? undefined : undefined,
    });

    if (dto.items && dto.items.length > 0) {
      for (const itemDto of dto.items) {
        const batch = grnBatches.find((b) => b.id === itemDto.batchId);
        if (!batch) continue;

        const oldNumberOfPacks = batch.quantityReceived / batch.packSize;
        const newNumberOfPacks = itemDto.numberOfPacks ?? oldNumberOfPacks;
        const newPackSize = itemDto.packSize ?? batch.packSize;
        const oldTotalUnits = batch.quantityReceived;
        const newTotalUnits = newNumberOfPacks * newPackSize;

        let costPerUnit = Number(batch.unitCost);
        if (itemDto.unitCost !== undefined) {
          costPerUnit = itemDto.unitCost / newPackSize;
        }

        let newSellingPrice = Number(batch.sellingPrice);
        if (itemDto.sellingPrice !== undefined) {
          newSellingPrice = itemDto.sellingPrice;
        } else if (itemDto.markupPercentage !== undefined) {
          newSellingPrice = Math.round(costPerUnit * (1 + itemDto.markupPercentage / 100) * 100) / 100;
        } else if (itemDto.unitCost !== undefined) {
          const currentSellingPrice = Number(batch.sellingPrice);
          const currentCostPerUnit = Number(batch.unitCost);
          if (currentCostPerUnit > 0) {
            const markupRatio = currentSellingPrice / currentCostPerUnit;
            newSellingPrice = Math.round(costPerUnit * markupRatio * 100) / 100;
          }
        }

        const newPackPrice = itemDto.packPrice !== undefined
          ? itemDto.packPrice
          : batch.packPrice != null
            ? Number(batch.packPrice)
            : null;

        await this.batchesRepository.update(batch.id, {
          batchNo: itemDto.batchNo,
          expiryDate: itemDto.expiryDate,
          packSize: itemDto.packSize,
          unitCost: itemDto.unitCost !== undefined ? itemDto.unitCost / newPackSize : undefined,
          sellingPrice: newSellingPrice,
          packPrice: newPackPrice != null ? String(newPackPrice) : null,
          quantityReceived: newTotalUnits,
        });

        if (newTotalUnits !== oldTotalUnits) {
          const receiptMovement = await this.repository.getReceiptStockMovement(batch.id);
          if (receiptMovement) {
            const delta = newTotalUnits - oldTotalUnits;
            await this.stockMovementsService.record({
              batchId: batch.id,
              locationId: receiptMovement.locationId,
              type: 'adjustment',
              quantity: delta,
              refId: id,
              refType: 'goods_receipt',
              createdBy: userId,
            });
          }
        }
      }
    }

    const updatedBatches = await this.repository.getBatchesByGrnId(id);
    const newTotalCost = updatedBatches.reduce(
      (sum, b) => sum + b.quantityReceived * Number(b.unitCost),
      0,
    );
    await this.repository.updateGrn(id, { totalCost: newTotalCost });

    await this.auditLog.log({
      userId,
      action: 'UPDATE_GOODS_RECEIPT',
      entityType: 'goods_receipt',
      entityId: id,
      afterData: { ...dto, totalCost: newTotalCost, items: dto.items?.length ?? 0 },
    });

    return this.findById(id);
  }

  private calculatePaymentDueDate(
    receiptDate: string,
    type: 'one_month' | 'two_months' | 'six_months' | 'one_year',
  ): string {
    const date = new Date(receiptDate);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    switch (type) {
      case 'one_month':
        return this.addMonths(receiptDate, 1);
      case 'two_months':
        return this.addMonths(receiptDate, 2);
      case 'six_months':
        return this.addMonths(receiptDate, 6);
      case 'one_year':
        return this.addMonths(receiptDate, 12);
      default:
        return receiptDate;
    }
  }

  private addMonths(dateString: string, months: number): string {
    const date = new Date(dateString);
    const newMonth = date.getMonth() + months;
    date.setMonth(newMonth);

    // Handle case where the day doesn't exist in the new month
    // (e.g., Jan 31 + 1 month = Mar 3, not Feb 31)
    if (date.getDate() < new Date(dateString).getDate()) {
      date.setDate(0); // Last day of the previous month
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async generateUniqueGrnNumber(supplierId: string): Promise<string> {
    let candidate = this.createGrnNumber();
    let attempt = 0;

    while (attempt < 5) {
      const exists = await this.repository.findByGrnNumberAndSupplier(
        candidate,
        supplierId,
      );
      if (!exists) {
        return candidate;
      }
      candidate = this.createGrnNumber();
      attempt += 1;
    }

    throw new ConflictException(
      'Unable to generate a unique GRN number. Please try again.',
    );
  }

  private createGrnNumber(): string {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.floor(Math.random() * 9000) + 1000;
    return `GRN-${datePart}-${randomPart}`;
  }

  private getFileExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
      throw new BadRequestException('Invoice file must be PDF, JPG, or PNG');
    }
    return ext;
  }
}
