import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let repository: jest.Mocked<DashboardRepository>;
  let notificationsService: jest.Mocked<NotificationsService>;

  beforeEach(async () => {
    repository = {
      getTodaySalesSummary: jest.fn(),
      getTodayProfitEstimate: jest.fn(),
      getTopSellingItems: jest.fn(),
      getExpiringStockValue: jest.fn(),
      getItemSalesVelocity: jest.fn(),
      getStoreStockByItem: jest.fn(),
      getMostRecentGrnSupplier: jest.fn(),
      getAllItemsWithStock: jest.fn(),
      getMostRecentSaleDate: jest.fn(),
      getAverageUnitCost: jest.fn(),
    } as any;

    notificationsService = {
      getSummary: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: DashboardRepository, useValue: repository },
        { provide: StockMovementsService, useValue: {} },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getSummary', () => {
    it('should return all summary data in parallel', async () => {
      repository.getTodaySalesSummary.mockResolvedValue({ totalAmount: 150000, transactionCount: 12 });
      repository.getTodayProfitEstimate.mockResolvedValue(45000);
      repository.getTopSellingItems.mockResolvedValue([]);
      repository.getExpiringStockValue.mockResolvedValue({ within30Days: 50000, within60Days: 80000, within90Days: 120000 });
      notificationsService.getSummary.mockResolvedValue({ zeroStock: 1, lowStock: 2, nearExpiry: 3, expired: 0 });

      const result = await service.getSummary();

      expect(result.todaySales.totalAmount).toBe(150000);
      expect(result.todaySales.transactionCount).toBe(12);
      expect(result.todayProfitEstimate).toBe(45000);
      expect(result.expiringStockValue.within30Days).toBe(50000);
      expect(result.unreadNotificationCounts.zeroStock).toBe(1);
    });
  });

  describe('getReorderSuggestions', () => {
    it('should return items below reorder level', async () => {
      repository.getItemSalesVelocity.mockResolvedValue([
        { itemId: 'item-1', itemName: 'Paracetamol', quantitySold: 90, reorderLevel: 100 },
      ]);
      repository.getStoreStockByItem.mockResolvedValue([
        { itemId: 'item-1', itemName: 'Paracetamol', reorderLevel: 100, currentStoreStock: 50 },
      ]);
      repository.getMostRecentGrnSupplier.mockResolvedValue('supplier-1');

      const result = await service.getReorderSuggestions(7);

      expect(result).toHaveLength(1);
      expect(result[0].itemName).toBe('Paracetamol');
      expect(result[0].currentStoreStock).toBe(50);
      expect(result[0].suggestedQuantity).toBeGreaterThan(0);
      expect(result[0].lastSupplierId).toBe('supplier-1');
    });

    it('should handle zero sales velocity without crashing', async () => {
      repository.getItemSalesVelocity.mockResolvedValue([
        { itemId: 'item-2', itemName: 'Ibuprofen', quantitySold: 0, reorderLevel: 50 },
      ]);
      repository.getStoreStockByItem.mockResolvedValue([
        { itemId: 'item-2', itemName: 'Ibuprofen', reorderLevel: 50, currentStoreStock: 20 },
      ]);
      repository.getMostRecentGrnSupplier.mockResolvedValue(null);

      const result = await service.getReorderSuggestions(7);

      expect(result).toHaveLength(1);
      expect(result[0].salesVelocity).toBe(0);
      expect(result[0].suggestedQuantity).toBe(30);
      expect(result[0].lastSupplierId).toBeNull();
    });

    it('should sort zero-stock items first', async () => {
      repository.getItemSalesVelocity.mockResolvedValue([
        { itemId: 'item-1', itemName: 'A', quantitySold: 10, reorderLevel: 100 },
        { itemId: 'item-2', itemName: 'B', quantitySold: 5, reorderLevel: 100 },
      ]);
      repository.getStoreStockByItem.mockResolvedValue([
        { itemId: 'item-1', itemName: 'A', reorderLevel: 100, currentStoreStock: 10 },
        { itemId: 'item-2', itemName: 'B', reorderLevel: 100, currentStoreStock: 0 },
      ]);
      repository.getMostRecentGrnSupplier.mockResolvedValue(null);

      const result = await service.getReorderSuggestions(7);

      expect(result[0].currentStoreStock).toBe(0);
      expect(result[1].currentStoreStock).toBe(10);
    });

    it('should not include items above reorder level', async () => {
      repository.getItemSalesVelocity.mockResolvedValue([
        { itemId: 'item-1', itemName: 'A', quantitySold: 10, reorderLevel: 100 },
      ]);
      repository.getStoreStockByItem.mockResolvedValue([
        { itemId: 'item-1', itemName: 'A', reorderLevel: 100, currentStoreStock: 150 },
      ]);

      const result = await service.getReorderSuggestions(7);
      expect(result).toHaveLength(0);
    });
  });

  describe('getDeadStock', () => {
    it('should return items not sold within threshold', async () => {
      repository.getAllItemsWithStock.mockResolvedValue([
        { itemId: 'item-1', itemName: 'Old Medicine', totalStock: 50 },
      ]);
      repository.getMostRecentSaleDate.mockResolvedValue('2025-01-01');
      repository.getAverageUnitCost.mockResolvedValue(3000);

      const result = await service.getDeadStock(60);

      expect(result).toHaveLength(1);
      expect(result[0].tiedUpValue).toBe(150000);
      expect(result[0].daysSinceLastSale).toBeGreaterThan(60);
    });

    it('should include items never sold', async () => {
      repository.getAllItemsWithStock.mockResolvedValue([
        { itemId: 'item-2', itemName: 'New Medicine', totalStock: 25 },
      ]);
      repository.getMostRecentSaleDate.mockResolvedValue(null);
      repository.getAverageUnitCost.mockResolvedValue(2000);

      const result = await service.getDeadStock(60);

      expect(result).toHaveLength(1);
      expect(result[0].daysSinceLastSale).toBe('never sold');
      expect(result[0].tiedUpValue).toBe(50000);
    });

    it('should exclude items sold recently', async () => {
      repository.getAllItemsWithStock.mockResolvedValue([
        { itemId: 'item-3', itemName: 'Fast Seller', totalStock: 100 },
      ]);
      const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      repository.getMostRecentSaleDate.mockResolvedValue(recentDate);
      repository.getAverageUnitCost.mockResolvedValue(1000);

      const result = await service.getDeadStock(60);
      expect(result).toHaveLength(0);
    });

    it('should sort by tiedUpValue descending', async () => {
      repository.getAllItemsWithStock.mockResolvedValue([
        { itemId: 'item-1', itemName: 'Cheap', totalStock: 10 },
        { itemId: 'item-2', itemName: 'Expensive', totalStock: 100 },
      ]);
      repository.getMostRecentSaleDate.mockResolvedValue(null);
      repository.getAverageUnitCost.mockImplementation(async (id: string) =>
        id === 'item-1' ? 1000 : 5000,
      );

      const result = await service.getDeadStock(60);

      expect(result[0].itemName).toBe('Expensive');
      expect(result[1].itemName).toBe('Cheap');
    });
  });
});
