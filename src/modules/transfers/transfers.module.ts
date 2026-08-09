import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { TransfersRepository } from './transfers.repository';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { AuditLogUtil } from '../../common/utils/audit-log.util';

@Module({
  imports: [StockMovementsModule],
  controllers: [TransfersController],
  providers: [TransfersService, TransfersRepository, AuditLogUtil],
  exports: [TransfersService],
})
export class TransfersModule {}
