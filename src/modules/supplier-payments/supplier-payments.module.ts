import { Module } from '@nestjs/common';
import { SupplierPaymentsController } from './supplier-payments.controller';
import { SupplierPaymentsService } from './supplier-payments.service';
import { SupplierPaymentsRepository } from './supplier-payments.repository';
import { AuditLogUtil } from '../../common/utils/audit-log.util';

@Module({
  controllers: [SupplierPaymentsController],
  providers: [
    SupplierPaymentsService,
    SupplierPaymentsRepository,
    AuditLogUtil,
  ],
  exports: [SupplierPaymentsService],
})
export class SupplierPaymentsModule {}
