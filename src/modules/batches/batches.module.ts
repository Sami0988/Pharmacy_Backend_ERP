import { Module } from '@nestjs/common';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';
import { BatchesRepository } from './batches.repository';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [StockMovementsModule, StorageModule],
  controllers: [BatchesController],
  providers: [BatchesService, BatchesRepository],
  exports: [BatchesService, BatchesRepository],
})
export class BatchesModule {}
