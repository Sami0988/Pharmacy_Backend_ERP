import { Controller, Post, Get, Query, Res, UseGuards, Logger, ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('backup')
export class BackupController {
  private readonly logger = new Logger(BackupController.name);
  private readonly cronSecret = process.env.BACKUP_CRON_SECRET;

  constructor(private readonly backupService: BackupService) {}

  @Public()
  @Get('oauth/authorize')
  getAuthorizeUrl(@Res() res: Response) {
    const url = this.backupService.getAuthorizeUrl();
    res.redirect(url);
  }

  @Public()
  @Get('oauth/callback')
  async handleCallback(@Query('code') code: string, @Res() res: Response) {
    try {
      const tokens = await this.backupService.exchangeCode(code);
      res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:50px">
          <h1>Authorization Successful!</h1>
          <p>Copy this refresh token and add it to Render as <code>GOOGLE_OAUTH_REFRESH_TOKEN</code>:</p>
          <pre style="background:#f0f0f0;padding:20px;border-radius:8px;font-size:14px;word-break:break-all">${tokens.refreshToken}</pre>
          <p style="color:#666">You can close this tab.</p>
        </body></html>
      `);
    } catch (error) {
      this.logger.error('OAuth callback failed', error);
      res.status(500).send(`Authorization failed: ${(error as Error).message}`);
    }
  }

  @Post('run')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async triggerBackup() {
    this.logger.log('Manual backup triggered');
    try {
      await this.backupService.runBackup();
      return { message: 'Backup completed successfully' };
    } catch (error) {
      this.logger.error('Backup failed', error);
      return { message: 'Backup failed', error: (error as Error).message };
    }
  }

   @Public()
   @Get('cron')
   async triggerCronBackup(@Query('secret') secret: string, @Res() res: Response) {
     if (!this.cronSecret || secret !== this.cronSecret) {
       res.status(403).json({ status: 'error', message: 'Invalid secret' });
       return;
     }

     this.logger.log('Cron backup triggered');
     
     // Return 202 Accepted immediately, run backup in background
     res.status(202).json({ status: 'accepted', message: 'Backup started' });

     // Run backup asynchronously
     this.backupService.runBackup().catch((err) => {
       this.logger.error('Background backup failed:', err instanceof Error ? err.message : String(err));
     });
   }
}
