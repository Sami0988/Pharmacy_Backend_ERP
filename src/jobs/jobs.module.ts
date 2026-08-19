import { Module } from '@nestjs/common';
import { StockAlertsProcessor } from './processors/stock-alerts.processor';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { StockMovementsModule } from '../modules/stock-movements/stock-movements.module';
import { DatabaseModule } from '../db/database.module';

@Module({
  imports: [
    NotificationsModule,
    StockMovementsModule,
    DatabaseModule,
  ],
  providers: [StockAlertsProcessor],
  exports: [StockAlertsProcessor],
})
export class JobsModule {}
