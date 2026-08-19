import { Test, TestingModule } from '@nestjs/testing';
import { TransfersService } from './transfers.service';
import { TransfersRepository } from './transfers.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { DatabaseService } from '../../db/database.service';
import { AuditLogUtil } from '../../common/utils/audit-log.util';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TransfersService', () => {
  let service: TransfersService;
  let repository: jest.Mocked<TransfersRepository>;
  let stockMovementsService: jest.Mocked<StockMovementsService>;
  let databaseService: jest.Mocked<DatabaseService>;
  let auditLog: jest.Mocked<AuditLogUtil>;

  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const mockBatch = {
    id: 'batch-1',
    itemId: 'item-1',
    grnId: 'grn-1',
    batchNo: 'BATCH-001',
    expiryDate: futureDate,
    unitCost: '10.00',
    quantityReceived: 100,
    qrCodeUrl: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    repository = {
      findBatchById: jest.fn(),
      getFefoSuggestions: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
    } as any;

    stockMovementsService = {
      getCurrentQuantity: jest.fn(),
      getBatchQuantitiesByLocation: jest.fn(),
      record: jest.fn(),
    } as any;

    databaseService = {
      db: {
        transaction: jest.fn(),
      },
    } as any;

    auditLog = { log: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransfersService,
        { provide: TransfersRepository, useValue: repository },
        { provide: StockMovementsService, useValue: stockMovementsService },
        { provide: DatabaseService, useValue: databaseService },
        { provide: AuditLogUtil, useValue: auditLog },
      ],
    }).compile();

    service = module.get<TransfersService>(TransfersService);
  });

  describe('getFefoSuggestions', () => {
    it('should return suggestions sorted by expiry date', async () => {
      repository.getFefoSuggestions.mockResolvedValue([
        {
          batchId: 'b1',
          batchNo: 'BATCH-001',
          expiryDate: futureDate,
          availableQuantity: 50,
          daysUntilExpiry: 30,
        },
        {
          batchId: 'b2',
          batchNo: 'BATCH-002',
          expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          availableQuantity: 30,
          daysUntilExpiry: 60,
        },
      ]);

      const result = await service.getFefoSuggestions('item-1', 'loc-1', 20);

      expect(result.suggestions).toHaveLength(2);
      expect(result.totalAvailable).toBe(80);
      expect(result.suggestions[0].batchId).toBe('b1');
    });

    it('should return empty suggestions when none available', async () => {
      repository.getFefoSuggestions.mockResolvedValue([]);
      const result = await service.getFefoSuggestions('item-1', 'loc-1', 20);
      expect(result.totalAvailable).toBe(0);
      expect(result.suggestions).toHaveLength(0);
    });
  });

  describe('create', () => {
    const dto = {
      batchId: 'batch-1',
      numberOfPacks: 2,
      fromLocationId: 'store-1',
      toLocationId: 'disp-1',
    };

    it('should reject same source and destination', async () => {
      await expect(
        service.create({ ...dto, toLocationId: 'store-1' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-integer numberOfPacks', async () => {
      await expect(
        service.create({ ...dto, numberOfPacks: 1.5 } as any, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject zero numberOfPacks', async () => {
      await expect(
        service.create({ ...dto, numberOfPacks: 0 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject both numberOfPacks and quantity', async () => {
      await expect(
        service.create({ ...dto, numberOfPacks: 2, quantity: 5 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject neither numberOfPacks nor quantity', async () => {
      await expect(
        service.create({ batchId: 'batch-1', fromLocationId: 'store-1', toLocationId: 'disp-1' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-existent batch', async () => {
      repository.findBatchById.mockResolvedValue(null);
      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject expired batch', async () => {
      repository.findBatchById.mockResolvedValue({
        ...mockBatch,
        expiryDate: pastDate,
      });
      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject insufficient stock', async () => {
      repository.findBatchById.mockResolvedValue(mockBatch);
      stockMovementsService.getCurrentQuantity.mockResolvedValue(5);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create transfer with packs', async () => {
      repository.findBatchById.mockResolvedValue(mockBatch);
      stockMovementsService.getCurrentQuantity.mockResolvedValue(100);

      const mockTransfer = {
        id: 'transfer-1',
        ...dto,
        quantity: 20,
        transferredBy: 'user-1',
        createdAt: new Date(),
      };

      databaseService.db.transaction.mockImplementation(async (fn: any) => {
        const tx = {
          insert: jest
            .fn()
            .mockReturnValueOnce({
              values: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([mockTransfer]),
              }),
            })
            .mockReturnValue({
              values: jest.fn().mockResolvedValue(undefined),
            }),
        };
        return fn(tx);
      });

      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([
        { locationId: 'store-1', quantity: 80 },
        { locationId: 'disp-1', quantity: 20, packSize: 10 },
      ]);

      const result = await service.create(dto, 'user-1');

      expect(result.id).toBe('transfer-1');
      expect(result.numberOfPacks).toBe(2);
      expect(result.packSize).toBe(10);
      expect(result.transferQuantity).toBe(20);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create_transfer' }),
      );
    });

    it('should create transfer with exact quantity', async () => {
      const batchWithPackSize = { ...mockBatch, packSize: 10 };
      repository.findBatchById.mockResolvedValue(batchWithPackSize);
      stockMovementsService.getCurrentQuantity.mockResolvedValue(100);

      const mockTransfer = {
        id: 'transfer-2',
        batchId: 'batch-1',
        quantity: 15,
        fromLocationId: 'store-1',
        toLocationId: 'disp-1',
        transferredBy: 'user-1',
        createdAt: new Date(),
      };

      databaseService.db.transaction.mockImplementation(async (fn: any) => {
        const tx = {
          insert: jest
            .fn()
            .mockReturnValueOnce({
              values: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([mockTransfer]),
              }),
            })
            .mockReturnValue({
              values: jest.fn().mockResolvedValue(undefined),
            }),
        };
        return fn(tx);
      });

      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([
        { locationId: 'store-1', quantity: 85, packSize: 10 },
        { locationId: 'disp-1', quantity: 15, packSize: 10 },
      ]);

      const result = await service.create({
        batchId: 'batch-1',
        quantity: 15,
        fromLocationId: 'store-1',
        toLocationId: 'disp-1',
      }, 'user-1');

      expect(result.id).toBe('transfer-2');
      expect(result.numberOfPacks).toBe(1);
      expect(result.packSize).toBe(10);
      expect(result.transferQuantity).toBe(15);
    });
  });

  describe('findById', () => {
    it('should return transfer with location names', async () => {
      repository.findById.mockResolvedValue({
        id: 'transfer-1',
        batchId: 'batch-1',
        quantity: 10,
        fromLocationId: 'store-1',
        toLocationId: 'disp-1',
        transferredBy: 'user-1',
        createdAt: new Date(),
        batchNo: 'BATCH-001',
        expiryDate: futureDate,
        itemName: 'Paracetamol',
        itemId: 'item-1',
        fromLocationName: 'Store',
        toLocationName: 'Dispatcher',
      });

      const result = await service.findById('transfer-1');
      expect(result?.fromLocationName).toBe('Store');
      expect(result?.toLocationName).toBe('Dispatcher');
    });

    it('should return null for non-existent transfer', async () => {
      repository.findById.mockResolvedValue(null);
      const result = await service.findById('bad-id');
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated transfers', async () => {
      repository.findAll.mockResolvedValue([
        {
          id: 'transfer-1',
          batchId: 'batch-1',
          quantity: 10,
          fromLocationId: 'store-1',
          toLocationId: 'disp-1',
          transferredBy: 'user-1',
          createdAt: new Date(),
          batchNo: 'BATCH-001',
          itemName: 'Paracetamol',
          itemId: 'item-1',
        },
      ]);

      const result = await service.findAll({ offset: 0, limit: 10 });
      expect(result).toHaveLength(1);
    });
  });
});
