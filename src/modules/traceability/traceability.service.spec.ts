import { Test, TestingModule } from '@nestjs/testing';
import { TraceabilityService } from './traceability.service';
import { TraceabilityRepository } from './traceability.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { SupplierPaymentsService } from '../supplier-payments/supplier-payments.service';
import { MinioService } from '../../common/storage/minio.service';
import { DatabaseService } from '../../db/database.service';
import { NotFoundException } from '@nestjs/common';

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));

describe('TraceabilityService', () => {
  let service: TraceabilityService;
  let repository: jest.Mocked<TraceabilityRepository>;
  let stockMovementsService: jest.Mocked<StockMovementsService>;
  let supplierPaymentsService: jest.Mocked<SupplierPaymentsService>;
  let minioService: jest.Mocked<MinioService>;
  let databaseService: jest.Mocked<DatabaseService>;

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const mockBatchRow = {
    batchId: 'batch-1',
    batchNo: 'BATCH-001',
    expiryDate: futureDate,
    unitCost: '3000',
    quantityReceived: 100,
    itemId: 'item-1',
    itemName: 'Paracetamol 500mg',
    genericName: 'Paracetamol',
    grnId: 'grn-1',
    grnNumber: 'GRN-001',
    receiptDate: '2024-01-15',
    invoiceDocumentUrl: 'invoices/supplier-1/GRN-001.pdf',
    totalCost: '300000',
    supplierId: 'supplier-1',
    supplierName: 'MedSupply Ltd',
    supplierPhone: '+256700111222',
    supplierLicenseNo: 'LIC-001',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    repository = {
      findByBatchNo: jest.fn(),
      findById: jest.fn(),
      getSalesHistory: jest.fn(),
      getReturnsForBatch: jest.fn(),
      getTotalSold: jest.fn(),
      getTransferHistory: jest.fn(),
    } as any;

    stockMovementsService = {
      getBatchQuantitiesByLocation: jest.fn(),
    } as any;

    supplierPaymentsService = {
      repository: {
        calculateGrnBalance: jest.fn(),
      },
    } as any;

    minioService = {
      getSignedUrl: jest.fn(),
    } as any;

    databaseService = {
      db: {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ name: 'Dispatcher' }]),
            }),
          }),
        }),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TraceabilityService,
        { provide: TraceabilityRepository, useValue: repository },
        { provide: StockMovementsService, useValue: stockMovementsService },
        { provide: SupplierPaymentsService, useValue: supplierPaymentsService },
        { provide: MinioService, useValue: minioService },
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    service = module.get<TraceabilityService>(TraceabilityService);
  });

  describe('traceByBatchNo', () => {
    it('should throw NotFoundException when no batches found', async () => {
      repository.findByBatchNo.mockResolvedValue([]);
      await expect(service.traceByBatchNo('NONEXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return trace data for matching batch', async () => {
      repository.findByBatchNo.mockResolvedValue([mockBatchRow]);
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([
        { locationId: 'loc-1', quantity: 85, packSize: 10 },
      ]);
      repository.getTotalSold.mockResolvedValue(15);
      repository.getSalesHistory.mockResolvedValue([]);
      repository.getReturnsForBatch.mockResolvedValue([]);
      repository.getTransferHistory.mockResolvedValue([]);
      supplierPaymentsService.repository.calculateGrnBalance.mockResolvedValue({
        totalCost: 300000,
        totalPaid: 200000,
        outstanding: 100000,
      });
      minioService.getSignedUrl.mockResolvedValue('https://minio/invoice.pdf');

      const result = await service.traceByBatchNo('BATCH-001');

      expect(result).toHaveLength(1);
      expect(result[0].batchNo).toBe('BATCH-001');
      expect(result[0].source.supplier.name).toBe('MedSupply Ltd');
      expect(result[0].source.invoiceDocumentSignedUrl).toBe(
        'https://minio/invoice.pdf',
      );
      expect(result[0].paymentStatus.outstanding).toBe(100000);
      expect(result[0].totalSold).toBe(15);
      expect(result[0].isExpired).toBe(false);
    });

    it('should trim whitespace from batchNo', async () => {
      repository.findByBatchNo.mockResolvedValue([mockBatchRow]);
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([]);
      repository.getTotalSold.mockResolvedValue(0);
      repository.getSalesHistory.mockResolvedValue([]);
      repository.getReturnsForBatch.mockResolvedValue([]);
      repository.getTransferHistory.mockResolvedValue([]);
      supplierPaymentsService.repository.calculateGrnBalance.mockResolvedValue(null);
      minioService.getSignedUrl.mockResolvedValue(null);

      await service.traceByBatchNo('  BATCH-001  ');
      expect(repository.findByBatchNo).toHaveBeenCalledWith('BATCH-001');
    });

    it('should return null signed URL when invoice document is missing', async () => {
      repository.findByBatchNo.mockResolvedValue([
        { ...mockBatchRow, invoiceDocumentUrl: null },
      ]);
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([]);
      repository.getTotalSold.mockResolvedValue(0);
      repository.getSalesHistory.mockResolvedValue([]);
      repository.getReturnsForBatch.mockResolvedValue([]);
      repository.getTransferHistory.mockResolvedValue([]);
      supplierPaymentsService.repository.calculateGrnBalance.mockResolvedValue(null);

      const result = await service.traceByBatchNo('BATCH-001');
      expect(result[0].source.invoiceDocumentSignedUrl).toBeNull();
    });

    it('should handle MinIO failure gracefully', async () => {
      repository.findByBatchNo.mockResolvedValue([mockBatchRow]);
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([]);
      repository.getTotalSold.mockResolvedValue(0);
      repository.getSalesHistory.mockResolvedValue([]);
      repository.getReturnsForBatch.mockResolvedValue([]);
      repository.getTransferHistory.mockResolvedValue([]);
      supplierPaymentsService.repository.calculateGrnBalance.mockResolvedValue(null);
      minioService.getSignedUrl.mockRejectedValue(new Error('MinIO down'));

      const result = await service.traceByBatchNo('BATCH-001');
      expect(result[0].source.invoiceDocumentSignedUrl).toBeNull();
    });

    it('should subtract returns from sales history', async () => {
      repository.findByBatchNo.mockResolvedValue([mockBatchRow]);
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([]);
      repository.getTotalSold.mockResolvedValue(3);
      repository.getSalesHistory.mockResolvedValue([
        {
          saleId: 'sale-1',
          saleDate: new Date(),
          quantitySold: 5,
          unitPrice: '5000',
          customerName: 'John',
          soldByUserName: 'Cashier',
          saleItemId: 'si-1',
        },
      ]);
      repository.getReturnsForBatch.mockResolvedValue([
        { saleItemId: 'si-1', quantityReturned: 2 },
      ]);
      repository.getTransferHistory.mockResolvedValue([]);
      supplierPaymentsService.repository.calculateGrnBalance.mockResolvedValue(null);

      const result = await service.traceByBatchNo('BATCH-001');
      expect(result[0].salesHistory[0].quantitySold).toBe(3);
    });

    it('should return multiple batches for shared batch numbers', async () => {
      repository.findByBatchNo.mockResolvedValue([
        mockBatchRow,
        { ...mockBatchRow, batchId: 'batch-2', grnId: 'grn-2', grnNumber: 'GRN-002' },
      ]);
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([]);
      repository.getTotalSold.mockResolvedValue(0);
      repository.getSalesHistory.mockResolvedValue([]);
      repository.getReturnsForBatch.mockResolvedValue([]);
      repository.getTransferHistory.mockResolvedValue([]);
      supplierPaymentsService.repository.calculateGrnBalance.mockResolvedValue(null);
      minioService.getSignedUrl.mockResolvedValue(null);

      const result = await service.traceByBatchNo('BATCH-001');
      expect(result).toHaveLength(2);
    });
  });

  describe('traceByBatchId', () => {
    it('should throw NotFoundException for non-existent batch', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.traceByBatchId('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return trace data for batch by ID', async () => {
      repository.findById.mockResolvedValue(mockBatchRow);
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([
        { locationId: 'loc-1', quantity: 50, packSize: 10 },
      ]);
      repository.getTotalSold.mockResolvedValue(50);
      repository.getSalesHistory.mockResolvedValue([]);
      repository.getReturnsForBatch.mockResolvedValue([]);
      repository.getTransferHistory.mockResolvedValue([]);
      supplierPaymentsService.repository.calculateGrnBalance.mockResolvedValue({
        totalCost: 300000,
        totalPaid: 300000,
        outstanding: 0,
      });
      minioService.getSignedUrl.mockResolvedValue('https://minio/doc.pdf');

      const result = await service.traceByBatchId('batch-1');
      expect(result.batchId).toBe('batch-1');
      expect(result.paymentStatus.outstanding).toBe(0);
    });
  });

  describe('getRecallImpact', () => {
    it('should throw NotFoundException for non-existent batch', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getRecallImpact('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return recall impact with current stock and sales', async () => {
      repository.findById.mockResolvedValue(mockBatchRow);
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([
        { locationId: 'store-1', quantity: 30, packSize: 10 },
        { locationId: 'disp-1', quantity: 10, packSize: 5 },
      ]);
      repository.getTotalSold.mockResolvedValue(60);
      repository.getSalesHistory.mockResolvedValue([
        {
          saleId: 'sale-1',
          saleDate: new Date(),
          quantitySold: 5,
          unitPrice: '5000',
          customerName: 'Jane',
          soldByUserName: 'Cashier',
          saleItemId: 'si-1',
        },
      ]);
      repository.getReturnsForBatch.mockResolvedValue([]);

      const result = await service.getRecallImpact('batch-1');
      expect(result.totalSold).toBe(60);
      expect(result.currentStock).toHaveLength(2);
      expect(result.salesHistory).toHaveLength(1);
      expect(result.isExpired).toBe(false);
    });
  });

  describe('isExpired / daysUntilExpiry', () => {
    it('should detect expired batch', async () => {
      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      repository.findById.mockResolvedValue({
        ...mockBatchRow,
        expiryDate: pastDate,
      });
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([]);
      repository.getTotalSold.mockResolvedValue(0);
      repository.getSalesHistory.mockResolvedValue([]);
      repository.getReturnsForBatch.mockResolvedValue([]);

      const result = await service.getRecallImpact('batch-1');
      expect(result.isExpired).toBe(true);
      expect(result.daysUntilExpiry).toBeLessThan(0);
    });

    it('should compute correct days until expiry', async () => {
      const futureDate2 = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      repository.findById.mockResolvedValue({
        ...mockBatchRow,
        expiryDate: futureDate2,
      });
      stockMovementsService.getBatchQuantitiesByLocation.mockResolvedValue([]);
      repository.getTotalSold.mockResolvedValue(0);
      repository.getSalesHistory.mockResolvedValue([]);
      repository.getReturnsForBatch.mockResolvedValue([]);

      const result = await service.getRecallImpact('batch-1');
      expect(result.isExpired).toBe(false);
      expect(result.daysUntilExpiry).toBe(10);
    });
  });
});
