import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { DatabaseModule } from '../../db/database.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'stock-alerts' }),
    StockMovementsModule,
    DatabaseModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  exports: [NotificationsService],
})
export class NotificationsModule {}
