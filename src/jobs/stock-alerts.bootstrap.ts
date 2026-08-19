import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class StockAlertsBootstrap {
  private readonly logger = new Logger(StockAlertsBootstrap.name);

  onModuleInit() {
    this.logger.log('Stock alerts: use GET /stock-alerts/cron for scheduled checks via cron-job.org');
  }
}
