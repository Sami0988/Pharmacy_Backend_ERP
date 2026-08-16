import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsRepository } from './notifications.repository';
import { DatabaseService } from '../../db/database.service';
import { goodsReceipts, supplierPayments } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { SaleCreatedEvent, PaymentRecordedEvent, TransferCompletedEvent } from '../../common/events';
import { PaginatedResponse } from '../../common/pagination';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly databaseService: DatabaseService,
  ) {}

  async findAll(params: {
    type?: string;
    isRead?: boolean;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<any>> {
    return this.repository.findAll({
      type: params.type,
      isRead: params.isRead,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    });
  }

  async getUnreadCount() {
    const count = await this.repository.countUnread();
    return { unreadCount: count };
  }

  async markAsRead(id: string) {
    const notification = await this.repository.markAsRead(id);
    return notification;
  }

  async markAllAsRead() {
    await this.repository.markAllAsRead();
    return { success: true };
  }

  async getSummary() {
    return this.repository.getSummary();
  }

  async createNotification(data: {
    type: string;
    title: string;
    message: string;
    itemId?: string;
    batchId?: string;
    thresholdDays?: number;
  }) {
    return this.repository.create(data);
  }

  async hasExistingUnread(type: string, identifierColumn: 'itemId' | 'batchId', identifierValue: string) {
    return this.repository.findExistingUnread(type, identifierColumn, identifierValue);
  }

  async hasExistingUnreadWithThreshold(type: string, batchId: string, thresholdDays: number) {
    return this.repository.findExistingUnreadWithThreshold(type, batchId, thresholdDays);
  }

  async markPaymentNotificationsAsReadByGrnId(grnId: string) {
    return this.repository.markPaymentNotificationsAsReadByGrnId(grnId);
  }

  @OnEvent('sale.created')
  handleSaleCreated(event: SaleCreatedEvent) {
    this.logger.debug(`Sale created event received: ${event.saleId}`);
  }

  @OnEvent('payment.recorded')
  async handlePaymentRecorded(event: PaymentRecordedEvent) {
    this.logger.debug(`Payment recorded event received: ${event.paymentId}`);

    try {
      const grnResult = await this.databaseService.db
        .select({
          totalCost: goodsReceipts.totalCost,
        })
        .from(goodsReceipts)
        .where(eq(goodsReceipts.id, event.grnId))
        .limit(1);

      if (grnResult.length === 0) return;

      const totalPaid = await this.databaseService.db
        .select({
          total: sql<string>`COALESCE(SUM(${supplierPayments.amountPaid}), 0)`,
        })
        .from(supplierPayments)
        .where(eq(supplierPayments.grnId, event.grnId));

      const outstanding = parseFloat(grnResult[0].totalCost) - parseFloat(totalPaid[0].total);

      if (outstanding <= 0) {
        await this.repository.markPaymentNotificationsAsReadByGrnId(event.grnId);
        this.logger.log(`Cleared payment notifications for fully paid GRN: ${event.grnId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to clear payment notifications for GRN ${event.grnId}`, error);
    }
  }

  @OnEvent('transfer.completed')
  handleTransferCompleted(event: TransferCompletedEvent) {
    this.logger.debug(`Transfer completed event received: ${event.transferId}`);
  }
}
