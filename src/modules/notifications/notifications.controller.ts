import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { NotificationsService } from './notifications.service';
import { StockAlertsProcessor } from './stock-alerts.processor';
import { PaginationQueryDto } from '../../common/pagination';

class NotificationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  isRead?: string;
}

@ApiTags('Notifications')
@ApiBearerAuth('jwt-access')
@Controller('notifications')
export class NotificationsController {
  private readonly cronSecret = process.env.STOCK_ALERTS_CRON_SECRET;

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly stockAlertsProcessor: StockAlertsProcessor,
  ) {}

  @Public()
  @Get('cron')
  async triggerCronCheck(@Query('secret') secret: string, @Res() res: Response) {
    if (!this.cronSecret || secret !== this.cronSecret) {
      res.status(403).json({ status: 'error', message: 'Invalid secret' });
      return;
    }

    res.status(202).json({ status: 'accepted', message: 'Stock alerts check started' });

    this.stockAlertsProcessor.process().catch((err) => {
      console.error('Background stock alerts check failed:', err);
    });
  }

  @Get()
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'List notifications with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by notification type' })
  @ApiQuery({ name: 'isRead', required: false, description: 'Filter by read status' })
  @ApiResponse({ status: 200, description: 'Paginated list of notifications' })
  findAll(@Query() query: NotificationsQueryDto) {
    return this.notificationsService.findAll({
      type: query.type,
      isRead: query.isRead !== undefined ? query.isRead === 'true' : undefined,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('unread-count')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount() {
    return this.notificationsService.getUnreadCount();
  }

  @Get('summary')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Get notification counts by type' })
  getSummary() {
    return this.notificationsService.getSummary();
  }

  @Patch('mark-all-read')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead() {
    return this.notificationsService.markAllAsRead();
  }

  @Patch(':id/read')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Post('run-check-now')
  @Roles('admin')
  @ApiOperation({ summary: 'Manually trigger stock alerts check' })
  async runCheckNow() {
    await this.stockAlertsProcessor.process();
    return { message: 'Stock alerts check completed' };
  }
}
