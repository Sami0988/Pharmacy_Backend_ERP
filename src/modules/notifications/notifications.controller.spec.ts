import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Queue } from 'bullmq';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsService>;
  let queue: jest.Mocked<Queue>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      getUnreadCount: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      getSummary: jest.fn(),
    } as any;

    queue = {
      add: jest.fn().mockResolvedValue({}),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: service },
        { provide: 'BullQueue_stock-alerts', useValue: queue },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  describe('findAll', () => {
    it('should return paginated notifications', async () => {
      service.findAll.mockResolvedValue([{ id: 'n-1', type: 'expired' }]);
      const result = await controller.findAll('expired', 'false', '1', '10');
      expect(service.findAll).toHaveBeenCalledWith({
        type: 'expired',
        isRead: false,
        page: 1,
        limit: 10,
      });
      expect(result).toHaveLength(1);
    });

    it('should handle missing query params', async () => {
      service.findAll.mockResolvedValue([]);
      await controller.findAll(undefined, undefined, undefined, undefined);
      expect(service.findAll).toHaveBeenCalledWith({
        type: undefined,
        isRead: undefined,
        page: undefined,
        limit: undefined,
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
    it('should enqueue the stock alerts job', async () => {
      const result = await controller.runCheckNow();
      expect(queue.add).toHaveBeenCalledWith('run-check', {}, { removeOnComplete: true });
      expect(result).toEqual({ message: 'Stock alerts check queued' });
    });
  });
});
