import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';

@Processor('backup-queue', { concurrency: 1 })
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(private readonly backupService: BackupService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.log('Running scheduled backup...');
    await this.backupService.runBackup();
  }
}

@Module({
  imports: [
    BullModule.registerQueue({ name: 'backup-queue' }),
  ],
  controllers: [BackupController],
  providers: [BackupService, BackupProcessor],
  exports: [BackupService],
})
export class BackupModule implements OnModuleInit {
  constructor(
    @InjectQueue('backup-queue') private backupQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.backupQueue.upsertJobScheduler(
      'daily-backup',
      { pattern: '0 2 * * *' },
      { name: 'daily-backup', data: {}, opts: { removeOnComplete: true, removeOnFail: false } },
    );
  }
}
