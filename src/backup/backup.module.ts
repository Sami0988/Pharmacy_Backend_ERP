import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Worker } from 'bullmq';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'backup-queue',
    }),
  ],
  controllers: [BackupController],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule implements OnModuleInit {
  constructor(
    @InjectQueue('backup-queue') private backupQueue: Queue,
    private backupService: BackupService,
  ) {}

  async onModuleInit() {
    await this.backupQueue.upsertJobScheduler(
      'daily-backup',
      { pattern: '0 2 * * *' },
      { name: 'daily-backup', data: {}, opts: { removeOnComplete: true, removeOnFail: false } },
    );

    new Worker(
      'backup-queue',
      async () => {
        await this.backupService.runBackup();
      },
      { connection: { url: process.env.REDIS_URL } },
    );
  }
}
