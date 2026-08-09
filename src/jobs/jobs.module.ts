import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StockAlertsProcessor } from './processors/stock-alerts.processor';
import { StockAlertsBootstrap } from './stock-alerts.bootstrap';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { StockMovementsModule } from '../modules/stock-movements/stock-movements.module';
import { DatabaseModule } from '../db/database.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'stock-alerts' }),
    NotificationsModule,
    StockMovementsModule,
    DatabaseModule,
  ],
  providers: [StockAlertsProcessor, StockAlertsBootstrap],
  exports: [BullModule],
})
export class JobsModule {}
