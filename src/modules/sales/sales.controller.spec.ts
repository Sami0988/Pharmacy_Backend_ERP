import { Test, TestingModule } from '@nestjs/testing';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('<html></html>'),
}));

describe('SalesController', () => {
  let controller: SalesController;
  let service: jest.Mocked<SalesService>;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      createReturn: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      getReceiptUrl: jest.fn(),
      regenerateReceipt: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [{ provide: SalesService, useValue: service }],
    }).compile();

    controller = module.get<SalesController>(SalesController);
  });

  describe('create', () => {
    it('should call service create with dto and userId', async () => {
      service.create.mockResolvedValue({
        id: 'sale-1',
        totalAmount: 10000,
      } as any);

      const dto = {
        branchId: 'branch-1',
        paymentMethod: 'cash',
        items: [{ itemId: 'item-1', quantity: 2 }],
      };

      const result = await controller.create(dto, 'user-1');
      expect(result.id).toBe('sale-1');
      expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  describe('findAll', () => {
    it('should parse query params and call service', async () => {
      service.findAll.mockResolvedValue([]);
      await controller.findAll(
        '0',
        '10',
        'branch-1',
        'cust-1',
        'user-1',
        '2024-01-01',
        '2024-12-31',
      );
      expect(service.findAll).toHaveBeenCalledWith({
        offset: 0,
        limit: 10,
        branchId: 'branch-1',
        customerId: 'cust-1',
        soldBy: 'user-1',
        fromDate: '2024-01-01',
        toDate: '2024-12-31',
      });
    });

    it('should use defaults when no query params', async () => {
      service.findAll.mockResolvedValue([]);
      await controller.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(service.findAll).toHaveBeenCalledWith({
        offset: undefined,
        limit: undefined,
        branchId: undefined,
        customerId: undefined,
        soldBy: undefined,
        fromDate: undefined,
        toDate: undefined,
      });
    });
  });

  describe('findOne', () => {
    it('should call service findById', async () => {
      service.findById.mockResolvedValue({ id: 'sale-1' } as any);
      const result = await controller.findOne('sale-1');
      expect(result.id).toBe('sale-1');
      expect(service.findById).toHaveBeenCalledWith('sale-1');
    });
  });

  describe('getReceiptUrl', () => {
    it('should call service getReceiptUrl', async () => {
      service.getReceiptUrl.mockResolvedValue('https://minio/receipt.pdf');
      const result = await controller.getReceiptUrl('sale-1');
      expect(result).toBe('https://minio/receipt.pdf');
      expect(service.getReceiptUrl).toHaveBeenCalledWith('sale-1');
    });
  });

  describe('regenerateReceipt', () => {
    it('should call service regenerateReceipt', async () => {
      service.regenerateReceipt.mockResolvedValue({
        receiptUrl: 'https://minio/receipt-v2.pdf',
      });
      const result = await controller.regenerateReceipt('sale-1');
      expect(result.receiptUrl).toBe('https://minio/receipt-v2.pdf');
      expect(service.regenerateReceipt).toHaveBeenCalledWith('sale-1');
    });
  });

  describe('createReturn', () => {
    it('should call service createReturn', async () => {
      service.createReturn.mockResolvedValue({
        id: 'return-1',
        saleItemId: 'si-1',
        quantity: 2,
      } as any);

      const dto = { saleItemId: 'si-1', quantity: 2, reason: 'Defective' };
      const result = await controller.createReturn('sale-1', dto, 'user-1');
      expect(result.id).toBe('return-1');
      expect(service.createReturn).toHaveBeenCalledWith('sale-1', dto, 'user-1');
    });
  });
});
