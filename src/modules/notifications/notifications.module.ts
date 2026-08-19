import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { DatabaseModule } from '../../db/database.module';
import { JobsModule } from '../../jobs/jobs.module';

@Module({
  imports: [
    StockMovementsModule,
    DatabaseModule,
    JobsModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  exports: [NotificationsService],
})
export class NotificationsModule {}
