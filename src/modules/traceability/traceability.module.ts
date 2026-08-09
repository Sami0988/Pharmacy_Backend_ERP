import { Module } from '@nestjs/common';
import { TraceabilityController } from './traceability.controller';
import { TraceabilityService } from './traceability.service';
import { TraceabilityRepository } from './traceability.repository';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { SupplierPaymentsModule } from '../supplier-payments/supplier-payments.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [StockMovementsModule, SupplierPaymentsModule, StorageModule],
  controllers: [TraceabilityController],
  providers: [TraceabilityService, TraceabilityRepository],
  exports: [TraceabilityService],
})
export class TraceabilityModule {}
