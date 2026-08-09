import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repository: jest.Mocked<NotificationsRepository>;

  beforeEach(async () => {
    repository = {
      findAll: jest.fn(),
      countUnread: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      getSummary: jest.fn(),
      create: jest.fn(),
      findExistingUnread: jest.fn(),
      findExistingUnreadWithThreshold: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('findAll', () => {
    it('should call repository with default pagination', async () => {
      repository.findAll.mockResolvedValue([]);
      const result = await service.findAll({});
      expect(repository.findAll).toHaveBeenCalledWith({
        type: undefined,
        isRead: undefined,
        offset: 0,
        limit: 20,
      });
      expect(result).toEqual([]);
    });

    it('should apply type and isRead filters', async () => {
      repository.findAll.mockResolvedValue([]);
      await service.findAll({ type: 'expired', isRead: false, page: 2, limit: 10 });
      expect(repository.findAll).toHaveBeenCalledWith({
        type: 'expired',
        isRead: false,
        offset: 10,
        limit: 10,
      });
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      repository.countUnread.mockResolvedValue(5);
      const result = await service.getUnreadCount();
      expect(result).toEqual({ unreadCount: 5 });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      repository.markAsRead.mockResolvedValue({ id: 'n-1', isRead: true } as any);
      const result = await service.markAsRead('n-1');
      expect(repository.markAsRead).toHaveBeenCalledWith('n-1');
      expect(result.id).toBe('n-1');
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all as read', async () => {
      repository.markAllAsRead.mockResolvedValue(undefined);
      const result = await service.markAllAsRead();
      expect(repository.markAllAsRead).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('getSummary', () => {
    it('should return summary from repository', async () => {
      repository.getSummary.mockResolvedValue({
        zeroStock: 3,
        lowStock: 5,
        nearExpiry: 8,
        expired: 2,
      });
      const result = await service.getSummary();
      expect(result).toEqual({
        zeroStock: 3,
        lowStock: 5,
        nearExpiry: 8,
        expired: 2,
      });
    });
  });

  describe('createNotification', () => {
    it('should create notification via repository', async () => {
      repository.create.mockResolvedValue({ id: 'n-1', type: 'expired' } as any);
      const result = await service.createNotification({
        type: 'expired',
        title: 'Test',
        message: 'Test message',
        batchId: 'batch-1',
      });
      expect(repository.create).toHaveBeenCalledWith({
        type: 'expired',
        title: 'Test',
        message: 'Test message',
        batchId: 'batch-1',
      });
      expect(result.id).toBe('n-1');
    });
  });

  describe('hasExistingUnread', () => {
    it('should check existing unread notifications', async () => {
      repository.findExistingUnread.mockResolvedValue(true);
      const result = await service.hasExistingUnread('zero_stock', 'itemId', 'item-1');
      expect(result).toBe(true);
    });

    it('should return false when none found', async () => {
      repository.findExistingUnread.mockResolvedValue(false);
      const result = await service.hasExistingUnread('zero_stock', 'itemId', 'item-1');
      expect(result).toBe(false);
    });
  });

  describe('hasExistingUnreadWithThreshold', () => {
    it('should check existing unread with threshold', async () => {
      repository.findExistingUnreadWithThreshold.mockResolvedValue(true);
      const result = await service.hasExistingUnreadWithThreshold('near_expiry', 'batch-1', 30);
      expect(result).toBe(true);
    });
  });
});
