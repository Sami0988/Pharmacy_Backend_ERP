import { Module } from '@nestjs/common';
import { StockMovementsService } from './stock-movements.service';
import { StockMovementsRepository } from './stock-movements.repository';
import { StockMovementsController } from './stock-movements.controller';

@Module({
  controllers: [StockMovementsController],
  providers: [StockMovementsService, StockMovementsRepository],
  exports: [StockMovementsService],
})
export class StockMovementsModule {}
