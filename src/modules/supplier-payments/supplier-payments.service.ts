import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SupplierPaymentsRepository } from './supplier-payments.repository';
import { DatabaseService } from '../../db/database.service';
import { goodsReceipts } from '../../db';
import { eq } from 'drizzle-orm';
import { AuditLogUtil } from '../../common/utils/audit-log.util';
import { CacheService } from '../../common/cache/cache.service';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { PaymentRecordedEvent } from '../../common/events';
import { PaginatedResponse } from '../../common/pagination';

@Injectable()
export class SupplierPaymentsService {
  private readonly logger = new Logger(SupplierPaymentsService.name);
  private readonly cachePrefix = 'supplier-payments';

  constructor(
    private readonly repository: SupplierPaymentsRepository,
    private readonly databaseService: DatabaseService,
    private readonly auditLog: AuditLogUtil,
    private readonly cache: CacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateSupplierPaymentDto, userId: string) {
    if (dto.amountPaid <= 0) {
      throw new BadRequestException('Amount paid must be greater than 0');
    }

    const grnResult = await this.databaseService.db
      .select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.id, dto.grnId))
      .limit(1);

    if (grnResult.length === 0) {
      throw new NotFoundException(`Goods receipt ${dto.grnId} not found`);
    }

    const grn = grnResult[0];
    if (grn.supplierId !== dto.supplierId) {
      throw new BadRequestException(
        'GRN does not belong to the specified supplier',
      );
    }

    const balance = await this.repository.calculateGrnBalance(dto.grnId);
    if (!balance) {
      throw new NotFoundException('Could not calculate GRN balance');
    }

    if (balance.outstanding <= 0) {
      throw new BadRequestException({
        message: 'This invoice is already fully paid',
        outstandingBalance: 0,
      });
    }

    if (dto.amountPaid > balance.outstanding) {
      throw new BadRequestException({
        message: 'Payment exceeds outstanding balance',
        outstandingBalance: balance.outstanding,
      });
    }

    const payment = await this.repository.create({
      supplierId: dto.supplierId,
      grnId: dto.grnId,
      amountPaid: dto.amountPaid,
      paymentDate: dto.paymentDate || new Date().toISOString().split('T')[0],
      method: dto.method,
      notes: dto.notes,
    });

    const newBalance = await this.repository.calculateGrnBalance(dto.grnId);

    await this.cache.del(`${this.cachePrefix}:grn:${dto.grnId}`);
    await this.cache.del(`${this.cachePrefix}:balance:${dto.supplierId}`);
    await this.cache.del(`${this.cachePrefix}:all-balances`);

    await this.auditLog.log({
      userId,
      action: 'RECORD_SUPPLIER_PAYMENT',
      entityType: 'supplier_payment',
      entityId: payment.id,
      afterData: {
        ...dto,
        outstandingBalance: newBalance?.outstanding ?? 0,
      },
    });

    this.eventEmitter.emit(
      'payment.recorded',
      new PaymentRecordedEvent(
        payment.id,
        dto.supplierId,
        dto.grnId,
        dto.amountPaid,
      ),
    );

    return {
      ...payment,
      amountPaid: parseFloat(payment.amountPaid),
      outstandingBalance: newBalance?.outstanding ?? 0,
    };
  }

  async getGrnPayments(grnId: string) {
    const cacheKey = `${this.cachePrefix}:grn:${grnId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const payments = await this.repository.findByGrnId(grnId);
    const balance = await this.repository.calculateGrnBalance(grnId);

    const result = {
      payments: payments.map((p) => ({
        ...p,
        amountPaid: parseFloat(p.amountPaid),
      })),
      balance: balance ?? { totalCost: 0, totalPaid: 0, outstanding: 0 },
    };

    await this.cache.set(cacheKey, result, 120);
    return result;
  }

  async getSupplierBalance(supplierId: string) {
    const cacheKey = `${this.cachePrefix}:balance:${supplierId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const balance = await this.repository.calculateSupplierBalance(supplierId);
    await this.cache.set(cacheKey, balance, 120);
    return balance;
  }

  async getSupplierPayments(
    supplierId: string,
    params: {
      page: number;
      limit: number;
    },
  ): Promise<PaginatedResponse<any>> {
    const result = await this.repository.findBySupplierId(supplierId, params);
    return {
      data: result.data.map((p: any) => ({
        ...p,
        amountPaid: parseFloat(p.amountPaid),
      })),
      meta: result.meta,
    };
  }

  async getAllSuppliersWithOutstanding() {
    const cacheKey = `${this.cachePrefix}:all-balances`;
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const result = await this.repository.getAllSuppliersWithOutstanding();
    await this.cache.set(cacheKey, result, 120);
    return result;
  }
}
