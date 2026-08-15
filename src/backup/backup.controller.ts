import { Controller, Post, UseGuards, Logger } from '@nestjs/common';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(private readonly backupService: BackupService) {}

  @Post('run')
  async triggerBackup() {
    this.logger.log('Manual backup triggered');
    await this.backupService.runBackup();
    return { message: 'Backup completed successfully' };
  }
}
