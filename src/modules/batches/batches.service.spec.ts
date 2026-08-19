import { Test, TestingModule } from '@nestjs/testing';
import { BatchesService } from './batches.service';
import { BatchesRepository } from './batches.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { MinioService } from '../../common/storage/minio.service';
import { DatabaseService } from '../../db/database.service';
import { NotFoundException } from '@nestjs/common';

describe('BatchesService', () => {
  let service: BatchesService;
  let repository: jest.Mocked<BatchesRepository>;
  let stockMovementsService: jest.Mocked<StockMovementsService>;
  let minioService: jest.Mocked<MinioService>;
  let databaseService: jest.Mocked<DatabaseService>;

  const mockBatch = {
    id: 'batch-1',
    itemId: 'item-1',
    grnId: 'grn-1',
    batchNo: 'BATCH-001',
    expiryDate: '2027-08-03',
    unitCost: '10',
    quantityReceived: 100,
    qrCodeUrl: 'batch-qr-codes/batch-1.png',
    createdAt: new Date(),
  };

  const mockItem = {
    id: 'item-1',
    name: 'Paracetamol',
    genericName: 'Paracetamol',
    category: 'Analgesic',
    unit: 'tablet',
    strength: '500mg',
    reorderLevel: 100,
    isControlledSubstance: false,
    createdAt: new Date(),
  };

  const mockGrnWithSupplier = {
    grn: {
      id: 'grn-1',
      supplierId: 'sup-1',
      branchId: 'branch-1',
      grnNumber: 'GRN-001',
      receiptDate: '2026-08-03',
      invoiceDocumentUrl: null,
      totalCost: '1000',
      createdBy: 'user-1',
      createdAt: new Date(),
    },
    supplierName: 'MedSupply Co.',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateQrCodeUrl: jest.fn(),
    } as any;

    stockMovementsService = {
      getCurrentQuantity: jest.fn(),
      getBatchQuantitiesByLocation: jest.fn(),
    } as any;

    minioService = {
      getSignedUrl: jest.fn(),
    } as any;

    databaseService = {
      db: {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([mockGrnWithSupplier]),
              }),
            }),
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockItem]),
            }),
          }),
        }),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchesService,
        { provide: BatchesRepository, useValue: repository },
        { provide: StockMovementsService, useValue: stockMovementsService },
        { provide: MinioService, useValue: minioService },
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    service = module.get<BatchesService>(BatchesService);
  });

  describe('findAll', () => {
    it('should call repository findAll', async () => {
      repository.findAll.mockResolvedValue([mockBatch] as any);
      const result = await service.findAll({ itemId: 'item-1' });
      expect(result).toEqual([mockBatch]);
    });
  });

  describe('findById', () => {
    it('should return batch with item, GRN, and quantities', async () => {
      repository.findById.mockResolvedValue(mockBatch as any);
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([
        { locationId: 'loc-1', quantity: 100, packSize: 10 },
      ]);

      const result = await service.findById('batch-1');

      expect(result.id).toBe('batch-1');
      expect(result.item).toEqual(mockItem);
      expect(result.supplierName).toBe('MedSupply Co.');
      expect(result.quantitiesByLocation).toEqual([
        { locationId: 'loc-1', quantity: 100, packSize: 10, numberOfPacks: 10 },
      ]);
    });

    it('should throw if batch not found', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findById('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getQrCodeUrl', () => {
    it('should return signed URL for QR code', async () => {
      repository.findById.mockResolvedValue(mockBatch as any);
      minioService.getSignedUrl.mockResolvedValue('http://qr-url');
      const result = await service.getQrCodeUrl('batch-1');
      expect(result).toBe('http://qr-url');
    });

    it('should throw if batch not found', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getQrCodeUrl('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if no QR code', async () => {
      repository.findById.mockResolvedValue({
        ...mockBatch,
        qrCodeUrl: null,
      } as any);
      await expect(service.getQrCodeUrl('batch-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
