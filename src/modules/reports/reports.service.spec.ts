import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { ReportsRepository } from './reports.repository';
import { SupplierPaymentsService } from '../supplier-payments/supplier-payments.service';
import { BadRequestException } from '@nestjs/common';

describe('ReportsService', () => {
  let service: ReportsService;
  let repository: jest.Mocked<ReportsRepository>;

  beforeEach(async () => {
    repository = {
      getStockReport: jest.fn(),
      getExpiryReport: jest.fn(),
      getSalesReport: jest.fn(),
      getSupplierBalanceReport: jest.fn(),
      getLastSaleDate: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ReportsRepository, useValue: repository },
        { provide: SupplierPaymentsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('getStockReport', () => {
    it('should return stock data as JSON by default', async () => {
      repository.getStockReport.mockResolvedValue([
        { itemId: 'item-1', itemName: 'Paracetamol', storeQuantity: 100, dispatcherQuantity: 50, totalQuantity: 150, totalValueAtCost: 450000 },
      ]);
      const result = await service.getStockReport();
      expect(result).toHaveLength(1);
      expect(result[0].totalQuantity).toBe(150);
    });

    it('should return CSV format when format=csv', async () => {
      repository.getStockReport.mockResolvedValue([
        { itemId: 'item-1', itemName: 'Paracetamol', storeQuantity: 100, dispatcherQuantity: 50, totalQuantity: 150, totalValueAtCost: 450000 },
      ]);
      const result = await service.getStockReport('csv');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('columns');
      expect(result.columns).toHaveLength(5);
    });
  });

  describe('getExpiryReport', () => {
    it('should return expiry data', async () => {
      repository.getExpiryReport.mockResolvedValue([]);
      const result = await service.getExpiryReport(90);
      expect(result).toEqual([]);
    });

    it('should default to 90 days', async () => {
      repository.getExpiryReport.mockResolvedValue([]);
      await service.getExpiryReport(undefined);
      expect(repository.getExpiryReport).toHaveBeenCalledWith(90);
    });
  });

  describe('getSalesReport', () => {
    it('should return sales data', async () => {
      repository.getSalesReport.mockResolvedValue([
        {
          saleId: 'sale-1',
          saleDate: new Date(),
          totalAmount: 50000,
          paymentMethod: 'cash',
          soldByName: 'Cashier',
          items: [{ itemName: 'Paracetamol', batchNo: 'BATCH-001', quantity: 10, unitPrice: 5000 }],
        },
      ]);
      const result = await service.getSalesReport('2024-01-01', '2024-12-31');
      expect(result).toHaveLength(1);
      expect(result[0].items).toHaveLength(1);
    });

    it('should reject startDate > endDate', async () => {
      await expect(
        service.getSalesReport('2024-12-31', '2024-01-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept equal dates', async () => {
      repository.getSalesReport.mockResolvedValue([]);
      const result = await service.getSalesReport('2024-06-15', '2024-06-15');
      expect(result).toEqual([]);
    });
  });

  describe('getSupplierBalanceReport', () => {
    it('should return supplier balances', async () => {
      repository.getSupplierBalanceReport.mockResolvedValue([
        { supplierId: 's-1', supplierName: 'MedSupply', totalCost: 500000, totalPaid: 300000, outstanding: 200000 },
      ]);
      const result = await service.getSupplierBalanceReport();
      expect(result).toHaveLength(1);
      expect(result[0].outstanding).toBe(200000);
    });
  });

  describe('getDeadStockReport', () => {
    it('should return dead stock items', async () => {
      repository.getStockReport.mockResolvedValue([
        { itemId: 'item-1', itemName: 'Old Med', storeQuantity: 10, dispatcherQuantity: 0, totalQuantity: 10, totalValueAtCost: 30000 },
      ]);
      repository.getLastSaleDate.mockResolvedValue('2025-01-01');

      const result = await service.getDeadStockReport(60);
      expect(result).toHaveLength(1);
      expect(result[0].tiedUpValue).toBe(30000);
    });

    it('should default to 60 days', async () => {
      repository.getStockReport.mockResolvedValue([]);
      await service.getDeadStockReport(undefined);
      expect(repository.getStockReport).toHaveBeenCalled();
    });
  });
});
