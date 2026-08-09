import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class StockAlertsBootstrap implements OnModuleInit {
  private readonly logger = new Logger(StockAlertsBootstrap.name);

  constructor(
    @InjectQueue('stock-alerts') private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    try {
      await this.queue.upsertJobScheduler(
        'daily-stock-alerts',
        { pattern: '0 6 * * *' },
        { name: 'run-check', data: {}, opts: { removeOnComplete: true } },
      );
      this.logger.log('Daily stock alerts job scheduled at 6:00 AM');
    } catch (error) {
      this.logger.warn(
        `Failed to schedule stock alerts job (Redis may be unavailable): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
