import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PdfExportService } from '../../common/export/pdf-export.service';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: jest.Mocked<ReportsService>;

  beforeEach(async () => {
    service = {
      getStockReport: jest.fn(),
      getExpiryReport: jest.fn(),
      getSalesReport: jest.fn(),
      getSupplierBalanceReport: jest.fn(),
      getDeadStockReport: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: service },
        { provide: PdfExportService, useValue: { generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')), buildHtmlFromRows: jest.fn().mockReturnValue('<html></html>') } },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  describe('getStock', () => {
    it('should return stock report as JSON', async () => {
      service.getStockReport.mockResolvedValue([{ itemName: 'A', totalQuantity: 10 }]);
      const result = await controller.getStock();
      expect(result).toHaveLength(1);
    });
  });

  describe('getExpiry', () => {
    it('should return expiry report', async () => {
      service.getExpiryReport.mockResolvedValue([]);
      const result = await controller.getExpiry(undefined, undefined);
      expect(result).toEqual([]);
    });

    it('should pass withinDays to service', async () => {
      service.getExpiryReport.mockResolvedValue([]);
      await controller.getExpiry('30', undefined);
      expect(service.getExpiryReport).toHaveBeenCalledWith(30, undefined);
    });
  });

  describe('getSales', () => {
    it('should return sales report', async () => {
      service.getSalesReport.mockResolvedValue([{ saleId: 's-1' }]);
      const result = await controller.getSales('2024-01-01', '2024-12-31');
      expect(result).toHaveLength(1);
    });
  });

  describe('getSupplierBalance', () => {
    it('should return supplier balance report', async () => {
      service.getSupplierBalanceReport.mockResolvedValue([{ supplierName: 'MedSupply', outstanding: 100000 }]);
      const result = await controller.getSupplierBalance();
      expect(result).toHaveLength(1);
    });
  });

  describe('getDeadStock', () => {
    it('should return dead stock report', async () => {
      service.getDeadStockReport.mockResolvedValue([{ itemName: 'Old Med', tiedUpValue: 50000 }]);
      const result = await controller.getDeadStock(undefined);
      expect(result).toHaveLength(1);
    });
  });
});
