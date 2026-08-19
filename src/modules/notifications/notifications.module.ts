import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { StockAlertsProcessor } from './stock-alerts.processor';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { DatabaseModule } from '../../db/database.module';

@Module({
  imports: [
    StockMovementsModule,
    DatabaseModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository, StockAlertsProcessor],
  exports: [NotificationsService, StockAlertsProcessor],
})
export class NotificationsModule {}
