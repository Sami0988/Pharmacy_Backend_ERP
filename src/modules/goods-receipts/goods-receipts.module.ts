import { Module } from '@nestjs/common';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptsRepository } from './goods-receipts.repository';
import { BatchesModule } from '../batches/batches.module';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuditLogUtil } from '../../common/utils/audit-log.util';

@Module({
  imports: [BatchesModule, StockMovementsModule, StorageModule],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService, GoodsReceiptsRepository, AuditLogUtil],
  exports: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
