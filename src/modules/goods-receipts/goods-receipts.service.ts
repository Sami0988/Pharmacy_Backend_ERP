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
      if (item.quantityReceived <= 0) {
        throw new BadRequestException(
          `Batch ${item.batchNo}: quantity must be positive`,
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
      if (item.sellingPrice !== undefined && item.sellingPrice < item.unitCost) {
        throw new BadRequestException(
          `Batch ${item.batchNo}: selling price (${item.sellingPrice}) cannot be less than unit cost (${item.unitCost})`,
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
      (sum, item) => sum + item.quantityReceived * item.unitCost,
      0,
    );

    const taxPaid = dto.taxPaid ?? false;
    const paymentDueDateType = dto.paymentDueDateType ?? 'one_month';
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
          const sellingPrice =
            item.sellingPrice !== undefined
              ? item.sellingPrice
              : Math.round(item.unitCost * (1 + item.markupPercentage! / 100) * 100) / 100;

          const [batch] = await tx
            .insert(batches)
            .values({
              itemId: item.itemId,
              grnId: grnRow.id,
              batchNo: item.batchNo,
              expiryDate: item.expiryDate,
              unitCost: String(item.unitCost),
              sellingPrice: String(sellingPrice),
              quantityReceived: item.quantityReceived,
            })
            .returning();

          await tx.insert(stockMovements).values({
            batchId: batch.id,
            locationId: storeLocationId,
            type: 'receipt',
            quantity: item.quantityReceived,
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
