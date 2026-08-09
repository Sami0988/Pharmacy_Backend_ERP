import { Test, TestingModule } from '@nestjs/testing';
import { SupplierPaymentsController } from './supplier-payments.controller';
import { SupplierPaymentsService } from './supplier-payments.service';

describe('SupplierPaymentsController', () => {
  let controller: SupplierPaymentsController;
  let service: jest.Mocked<SupplierPaymentsService>;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      getGrnPayments: jest.fn(),
      getSupplierBalance: jest.fn(),
      getSupplierPayments: jest.fn(),
      getAllSuppliersWithOutstanding: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupplierPaymentsController],
      providers: [{ provide: SupplierPaymentsService, useValue: service }],
    }).compile();

    controller = module.get<SupplierPaymentsController>(
      SupplierPaymentsController,
    );
  });

  describe('create', () => {
    it('should call service create', async () => {
      service.create.mockResolvedValue({
        id: 'pay-1',
        amountPaid: 500,
        outstandingBalance: 500,
      } as any);

      const dto = {
        supplierId: 'sup-1',
        grnId: 'grn-1',
        amountPaid: 500,
        paymentDate: '2026-08-03',
        method: 'cash',
      };

      const result = await controller.create(dto, 'user-1');
      expect(result.amountPaid).toBe(500);
      expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  describe('getGrnPayments', () => {
    it('should return payments and balance', async () => {
      service.getGrnPayments.mockResolvedValue({
        payments: [],
        balance: { totalCost: 1000, totalPaid: 0, outstanding: 1000 },
      });

      const result = await controller.getGrnPayments('grn-1');
      expect(result.balance.outstanding).toBe(1000);
    });
  });

  describe('getSupplierBalance', () => {
    it('should return balance', async () => {
      service.getSupplierBalance.mockResolvedValue({
        totalCost: 2000,
        totalPaid: 1000,
        outstanding: 1000,
      });

      const result = await controller.getSupplierBalance('sup-1');
      expect(result.outstanding).toBe(1000);
    });
  });

  describe('getSupplierPayments', () => {
    it('should return payment history', async () => {
      service.getSupplierPayments.mockResolvedValue([]);
      await controller.getSupplierPayments('sup-1', '0', '10');
      expect(service.getSupplierPayments).toHaveBeenCalledWith('sup-1', {
        offset: 0,
        limit: 10,
      });
    });
  });

  describe('getAllSuppliersWithOutstanding', () => {
    it('should return list', async () => {
      service.getAllSuppliersWithOutstanding.mockResolvedValue([]);
      const result = await controller.getAllSuppliersWithOutstanding();
      expect(result).toEqual([]);
    });
  });
});
