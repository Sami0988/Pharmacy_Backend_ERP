import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { StockAlertsProcessor } from '../../../jobs/processors/stock-alerts.processor';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsService>;
  let processor: jest.Mocked<StockAlertsProcessor>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      getUnreadCount: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      getSummary: jest.fn(),
    } as any;

    processor = {
      process: jest.fn().mockResolvedValue({ zeroStock: 0, lowStock: 0, nearExpiry: 0, expired: 0, paymentDue: 0, paymentOverdue: 0 }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: service },
        { provide: StockAlertsProcessor, useValue: processor },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  describe('findAll', () => {
    it('should return paginated notifications', async () => {
      service.findAll.mockResolvedValue([{ id: 'n-1', type: 'expired' }]);
      const result = await controller.findAll({ type: 'expired', isRead: 'false', page: '1', limit: '10' } as any);
      expect(service.findAll).toHaveBeenCalledWith({
        type: 'expired',
        isRead: false,
        page: '1',
        limit: '10',
      });
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      service.getUnreadCount.mockResolvedValue({ unreadCount: 3 });
      const result = await controller.getUnreadCount();
      expect(result).toEqual({ unreadCount: 3 });
    });
  });

  describe('getSummary', () => {
    it('should return summary', async () => {
      service.getSummary.mockResolvedValue({
        zeroStock: 1,
        lowStock: 2,
        nearExpiry: 3,
        expired: 0,
      });
      const result = await controller.getSummary();
      expect(result.zeroStock).toBe(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark one notification read', async () => {
      service.markAsRead.mockResolvedValue({ id: 'n-1', isRead: true });
      const result = await controller.markAsRead('n-1');
      expect(service.markAsRead).toHaveBeenCalledWith('n-1');
      expect(result.isRead).toBe(true);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all read', async () => {
      service.markAllAsRead.mockResolvedValue({ success: true });
      const result = await controller.markAllAsRead();
      expect(result).toEqual({ success: true });
    });
  });

  describe('runCheckNow', () => {
    it('should run the stock alerts check directly', async () => {
      const result = await controller.runCheckNow();
      expect(processor.process).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Stock alerts check completed' });
    });
  });
});
