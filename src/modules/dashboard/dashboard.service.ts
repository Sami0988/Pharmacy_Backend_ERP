import { Injectable } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly stockMovementsService: StockMovementsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getSummary() {
    const [todaySales, todayProfitEstimate, topSellingItems, expiringStockValue, unreadNotificationCounts] =
      await Promise.all([
        this.repository.getTodaySalesSummary(),
        this.repository.getTodayProfitEstimate(),
        this.repository.getTopSellingItems(30, 5),
        this.repository.getExpiringStockValue(),
        this.notificationsService.getSummary(),
      ]);
 
    const todayProfit = {
      estimatedProfit: todayProfitEstimate,
      margin:
        todaySales.totalAmount > 0
          ? Math.round((todayProfitEstimate / todaySales.totalAmount) * 10000) / 100
          : 0,
    };
 
    return {
      todaySales,
      todayProfit,
      topSellingItems,
      expiringStockValue,
      unreadNotificationCounts,
    };
  }
 
  async getInventoryCounts() {
    return this.repository.getInventoryCounts();
  }
 
  async getCategoryBreakdown() {
    return this.repository.getCategoryBreakdown();
  }
 
  async getRevenueTrend(months: number = 6) {
    return this.repository.getRevenueTrend(months);
  }
 
  async getSparklines(days: number = 14) {
    return this.repository.getSparklineSeries(days);
  }
 
  async getReorderSuggestions(leadTimeDays: number = 7) {
    const itemVelocities = await this.repository.getItemSalesVelocity(30);
    const storeStockData = await this.repository.getStoreStockByItem();

    const stockMap = new Map<string, number>();
    for (const s of storeStockData) {
      stockMap.set(s.itemId, s.currentStoreStock);
    }

    const suggestions: Array<{
      itemId: string;
      itemName: string;
      currentStoreStock: number;
      reorderLevel: number;
      salesVelocity: number;
      suggestedQuantity: number;
      lastSupplierId: string | null;
    }> = [];

    for (const item of itemVelocities) {
      const currentStock = stockMap.get(item.itemId) ?? 0;
      if (currentStock >= item.reorderLevel) continue;

      const salesVelocity = item.quantitySold / 30;
      const deficit = item.reorderLevel - currentStock;
      const safetyStock = Math.ceil(salesVelocity * leadTimeDays);
      const suggestedQuantity = deficit + safetyStock;
      const lastSupplierId = await this.repository.getMostRecentGrnSupplier(item.itemId);

      suggestions.push({
        itemId: item.itemId,
        itemName: item.itemName,
        currentStoreStock: currentStock,
        reorderLevel: item.reorderLevel,
        salesVelocity: Math.round(salesVelocity * 100) / 100,
        suggestedQuantity,
        lastSupplierId,
      });
    }

    suggestions.sort((a, b) => {
      if (a.currentStoreStock === 0 && b.currentStoreStock !== 0) return -1;
      if (a.currentStoreStock !== 0 && b.currentStoreStock === 0) return 1;
      const ratioA = a.reorderLevel > 0 ? a.currentStoreStock / a.reorderLevel : 0;
      const ratioB = b.reorderLevel > 0 ? b.currentStoreStock / b.reorderLevel : 0;
      return ratioA - ratioB;
    });

    return suggestions;
  }

  async getDeadStock(daysThreshold: number = 60) {
    const itemsWithStock = await this.repository.getAllItemsWithStock();
    const results: Array<{
      itemId: string;
      itemName: string;
      totalQuantityOnHand: number;
      tiedUpValue: number;
      daysSinceLastSale: number | string;
    }> = [];

    for (const item of itemsWithStock) {
      const lastSaleDate = await this.repository.getMostRecentSaleDate(item.itemId);
      let daysSinceLastSale: number | string;

      if (!lastSaleDate) {
        daysSinceLastSale = 'never sold';
      } else {
        const lastDate = new Date(lastSaleDate);
        const now = new Date();
        daysSinceLastSale = Math.floor(
          (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      const include =
        daysSinceLastSale === 'never sold' ||
        (typeof daysSinceLastSale === 'number' && daysSinceLastSale > daysThreshold);

      if (!include) continue;

      const avgCost = await this.repository.getAverageUnitCost(item.itemId);
      const tiedUpValue = item.totalStock * avgCost;

      results.push({
        itemId: item.itemId,
        itemName: item.itemName,
        totalQuantityOnHand: item.totalStock,
        tiedUpValue: Math.round(tiedUpValue * 100) / 100,
        daysSinceLastSale,
      });
    }

    results.sort((a, b) => b.tiedUpValue - a.tiedUpValue);
    return results;
  }
}
