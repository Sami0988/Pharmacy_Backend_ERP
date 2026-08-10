import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesRepository } from './sales.repository';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { TransfersModule } from '../transfers/transfers.module';
import { CustomersModule } from '../customers/customers.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuditLogUtil } from '../../common/utils/audit-log.util';
import { PdfModule } from '../../common/pdf/pdf.module';

@Module({
  imports: [
    StockMovementsModule,
    TransfersModule,
    CustomersModule,
    StorageModule,
    PdfModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, SalesRepository, AuditLogUtil],
  exports: [SalesService],
})
export class SalesModule {}
