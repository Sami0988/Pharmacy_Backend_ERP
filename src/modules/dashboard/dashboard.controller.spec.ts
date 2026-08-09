import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: jest.Mocked<DashboardService>;

  beforeEach(async () => {
    service = {
      getSummary: jest.fn(),
      getReorderSuggestions: jest.fn(),
      getDeadStock: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: service }],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  describe('getSummary', () => {
    it('should return dashboard summary', async () => {
      service.getSummary.mockResolvedValue({
        todaySales: { totalAmount: 100000, transactionCount: 5 },
        todayProfitEstimate: 30000,
        topSellingItems: [],
        expiringStockValue: { within30Days: 10000, within60Days: 20000, within90Days: 30000 },
        unreadNotificationCounts: { zeroStock: 0, lowStock: 1, nearExpiry: 2, expired: 0 },
      });
      const result = await controller.getSummary();
      expect(result.todaySales.totalAmount).toBe(100000);
      expect(result.todayProfitEstimate).toBe(30000);
    });
  });

  describe('getReorderSuggestions', () => {
    it('should call service with leadTimeDays', async () => {
      service.getReorderSuggestions.mockResolvedValue([]);
      await controller.getReorderSuggestions('10');
      expect(service.getReorderSuggestions).toHaveBeenCalledWith(10);
    });

    it('should default to 7 days for invalid input', async () => {
      service.getReorderSuggestions.mockResolvedValue([]);
      await controller.getReorderSuggestions('abc');
      expect(service.getReorderSuggestions).toHaveBeenCalledWith(7);
    });

    it('should default to 7 days for negative input', async () => {
      service.getReorderSuggestions.mockResolvedValue([]);
      await controller.getReorderSuggestions('-5');
      expect(service.getReorderSuggestions).toHaveBeenCalledWith(7);
    });
  });

  describe('getDeadStock', () => {
    it('should call service with daysThreshold', async () => {
      service.getDeadStock.mockResolvedValue([]);
      await controller.getDeadStock('90');
      expect(service.getDeadStock).toHaveBeenCalledWith(90);
    });

    it('should default to 60 days', async () => {
      service.getDeadStock.mockResolvedValue([]);
      await controller.getDeadStock(undefined);
      expect(service.getDeadStock).toHaveBeenCalledWith(60);
    });
  });
});
