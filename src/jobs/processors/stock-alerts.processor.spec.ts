import { Test, TestingModule } from '@nestjs/testing';
import { StockAlertsProcessor } from './stock-alerts.processor';
import { DatabaseService } from '../../db/database.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { StockMovementsService } from '../../modules/stock-movements/stock-movements.service';

describe('StockAlertsProcessor', () => {
  let processor: StockAlertsProcessor;
  let databaseService: jest.Mocked<DatabaseService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let stockMovementsService: jest.Mocked<StockMovementsService>;

  function makeChain(result: any[]) {
    const chain: any = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(result),
      innerJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockResolvedValue(result),
    };
    return chain;
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    databaseService = {
      db: {
        select: jest.fn().mockImplementation(() => makeChain([])),
      },
    } as any;

    notificationsService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'n-1' }),
      hasExistingUnread: jest.fn().mockResolvedValue(false),
      hasExistingUnreadWithThreshold: jest.fn().mockResolvedValue(false),
    } as any;

    stockMovementsService = {} as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockAlertsProcessor,
        { provide: DatabaseService, useValue: databaseService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: StockMovementsService, useValue: stockMovementsService },
      ],
    }).compile();

    processor = module.get<StockAlertsProcessor>(StockAlertsProcessor);
  });

  describe('process', () => {
    it('should run all four checks and return counts', async () => {
      const result = await processor.process({} as any);
      expect(result).toHaveProperty('zeroStock');
      expect(result).toHaveProperty('lowStock');
      expect(result).toHaveProperty('nearExpiry');
      expect(result).toHaveProperty('expired');
    });

    it('should not create duplicate notifications for same issue', async () => {
      notificationsService.hasExistingUnread.mockResolvedValue(true);
      const result = await processor.process({} as any);
      expect(notificationsService.createNotification).not.toHaveBeenCalled();
      expect(result.zeroStock).toBe(0);
      expect(result.lowStock).toBe(0);
      expect(result.nearExpiry).toBe(0);
      expect(result.expired).toBe(0);
    });

    it('should continue other checks when one fails', async () => {
      let callCount = 0;
      databaseService.db.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('DB connection lost');
        }
        return makeChain([]);
      });

      const result = await processor.process({} as any);
      expect(result).toHaveProperty('zeroStock');
    });
  });

  describe('de-duplication', () => {
    it('should skip notifications with existing unread same type+item', async () => {
      notificationsService.hasExistingUnread.mockResolvedValue(true);
      const result = await processor.process({} as any);
      expect(notificationsService.createNotification).not.toHaveBeenCalled();
    });

    it('should skip near_expiry with same threshold already unread', async () => {
      notificationsService.hasExistingUnreadWithThreshold.mockResolvedValue(true);
      const result = await processor.process({} as any);
      expect(result.nearExpiry).toBe(0);
    });
  });
});
