import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DatabaseModule } from '../../db/database.module';

@Module({
  imports: [StockMovementsModule, NotificationsModule, DatabaseModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
  exports: [DashboardService],
})
export class DashboardModule {}
