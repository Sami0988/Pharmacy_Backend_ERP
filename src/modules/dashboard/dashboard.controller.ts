import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth('jwt-access')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get dashboard summary data' })
  @ApiResponse({ status: 200, description: 'Dashboard summary with sales, profit, top sellers, expiring stock, notifications' })
  getSummary() {
    return this.dashboardService.getSummary();
  }

  @Get('reorder-suggestions')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Get auto-reorder suggestions' })
  @ApiQuery({ name: 'leadTimeDays', required: false })
  @ApiResponse({ status: 200, description: 'Reorder suggestions sorted by urgency' })
  getReorderSuggestions(@Query('leadTimeDays') leadTimeDays?: string) {
    const days = leadTimeDays ? parseInt(leadTimeDays, 10) : 7;
    return this.dashboardService.getReorderSuggestions(Number.isFinite(days) && days > 0 ? days : 7);
  }
 
  @Get('inventory-counts')
  @ApiOperation({ summary: 'Get inventory counts for dashboard summary' })
  @ApiResponse({ status: 200, description: 'Inventory counts including in-stock medicines, low-stock items, and out-of-stock items' })
  getInventoryCounts() {
    return this.dashboardService.getInventoryCounts();
  }
 
  @Get('category-breakdown')
  @ApiOperation({ summary: 'Get inventory category breakdown' })
  @ApiResponse({ status: 200, description: 'Inventory distribution by category' })
  getCategoryBreakdown() {
    return this.dashboardService.getCategoryBreakdown();
  }
 
  @Get('revenue-trend')
  @ApiOperation({ summary: 'Get revenue, profit, expenses, and credit sales trends' })
  @ApiQuery({ name: 'months', required: false })
  @ApiResponse({ status: 200, description: 'Monthly financial trends for the dashboard' })
  getRevenueTrend(@Query('months') months?: string) {
    const count = months ? parseInt(months, 10) : 6;
    return this.dashboardService.getRevenueTrend(Number.isFinite(count) && count > 0 ? count : 6);
  }
 
  @Get('sparklines')
  @ApiOperation({ summary: 'Get dashboard sparkline series' })
  @ApiQuery({ name: 'days', required: false })
  @ApiResponse({ status: 200, description: 'Recent daily series for dashboard stat cards' })
  getSparklines(@Query('days') days?: string) {
    const count = days ? parseInt(days, 10) : 14;
    return this.dashboardService.getSparklines(Number.isFinite(count) && count > 0 ? count : 14);
  }
 
  @Get('dead-stock')
  @Roles('admin')
  @ApiOperation({ summary: 'Get dead-stock report' })
  @ApiQuery({ name: 'daysThreshold', required: false })
  @ApiResponse({ status: 200, description: 'Items with no sales in threshold period' })
  getDeadStock(@Query('daysThreshold') daysThreshold?: string) {
    const days = daysThreshold ? parseInt(daysThreshold, 10) : 60;
    return this.dashboardService.getDeadStock(Number.isFinite(days) && days > 0 ? days : 60);
  }
}
