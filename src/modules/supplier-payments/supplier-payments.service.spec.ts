import { Test, TestingModule } from '@nestjs/testing';
import { SupplierPaymentsService } from './supplier-payments.service';
import { SupplierPaymentsRepository } from './supplier-payments.repository';
import { DatabaseService } from '../../db/database.service';
import { AuditLogUtil } from '../../common/utils/audit-log.util';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('SupplierPaymentsService', () => {
  let service: SupplierPaymentsService;
  let repository: jest.Mocked<SupplierPaymentsRepository>;
  let databaseService: jest.Mocked<DatabaseService>;
  let auditLog: jest.Mocked<AuditLogUtil>;

  const mockGrn = {
    id: 'grn-1',
    supplierId: 'sup-1',
    branchId: 'branch-1',
    grnNumber: 'GRN-001',
    receiptDate: '2026-08-01',
    invoiceDocumentUrl: null,
    totalCost: '1000',
    createdBy: 'user-1',
    createdAt: new Date(),
  };

  const mockPayment = {
    id: 'pay-1',
    supplierId: 'sup-1',
    grnId: 'grn-1',
    amountPaid: '500',
    paymentDate: '2026-08-03',
    method: 'cash',
    notes: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    repository = {
      create: jest.fn(),
      findByGrnId: jest.fn(),
      findBySupplierId: jest.fn(),
      calculateGrnBalance: jest.fn(),
      calculateSupplierBalance: jest.fn(),
      getAllSuppliersWithOutstanding: jest.fn(),
    } as any;

    databaseService = {
      db: {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockGrn]),
            }),
          }),
        }),
      },
    } as any;

    auditLog = { log: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierPaymentsService,
        { provide: SupplierPaymentsRepository, useValue: repository },
        { provide: DatabaseService, useValue: databaseService },
        { provide: AuditLogUtil, useValue: auditLog },
      ],
    }).compile();

    service = module.get<SupplierPaymentsService>(SupplierPaymentsService);
  });

  describe('create', () => {
    const dto = {
      supplierId: 'sup-1',
      grnId: 'grn-1',
      amountPaid: 500,
      paymentDate: '2026-08-03',
      method: 'cash',
    };

    it('should reject zero amount', async () => {
      await expect(
        service.create({ ...dto, amountPaid: 0 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject negative amount', async () => {
      await expect(
        service.create({ ...dto, amountPaid: -100 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if GRN not found', async () => {
      databaseService.db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject if GRN belongs to different supplier', async () => {
      databaseService.db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest
              .fn()
              .mockResolvedValue([{ ...mockGrn, supplierId: 'sup-other' }]),
          }),
        }),
      } as any);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if GRN already fully paid', async () => {
      repository.calculateGrnBalance.mockResolvedValue({
        totalCost: 1000,
        totalPaid: 1000,
        outstanding: 0,
      });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject overpayment', async () => {
      repository.calculateGrnBalance.mockResolvedValue({
        totalCost: 1000,
        totalPaid: 800,
        outstanding: 200,
      });

      await expect(
        service.create({ ...dto, amountPaid: 500 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create payment and return balance', async () => {
      repository.calculateGrnBalance
        .mockResolvedValueOnce({
          totalCost: 1000,
          totalPaid: 0,
          outstanding: 1000,
        })
        .mockResolvedValueOnce({
          totalCost: 1000,
          totalPaid: 500,
          outstanding: 500,
        });

      repository.create.mockResolvedValue(mockPayment as any);

      const result = await service.create(dto, 'user-1');

      expect(result.amountPaid).toBe(500);
      expect(result.outstandingBalance).toBe(500);
      expect(repository.create).toHaveBeenCalled();
      expect(auditLog.log).toHaveBeenCalled();
    });

    it('should allow partial payment', async () => {
      repository.calculateGrnBalance
        .mockResolvedValueOnce({
          totalCost: 1000,
          totalPaid: 0,
          outstanding: 1000,
        })
        .mockResolvedValueOnce({
          totalCost: 1000,
          totalPaid: 300,
          outstanding: 700,
        });

      repository.create.mockResolvedValue({
        ...mockPayment,
        amountPaid: '300',
      } as any);

      const result = await service.create(
        { ...dto, amountPaid: 300 },
        'user-1',
      );
      expect(result.outstandingBalance).toBe(700);
    });
  });

  describe('getGrnPayments', () => {
    it('should return payments and balance', async () => {
      repository.findByGrnId.mockResolvedValue([mockPayment] as any);
      repository.calculateGrnBalance.mockResolvedValue({
        totalCost: 1000,
        totalPaid: 500,
        outstanding: 500,
      });

      const result = await service.getGrnPayments('grn-1');
      expect(result.payments).toHaveLength(1);
      expect(result.balance.outstanding).toBe(500);
    });
  });

  describe('getSupplierBalance', () => {
    it('should return supplier balance', async () => {
      repository.calculateSupplierBalance.mockResolvedValue({
        totalCost: 5000,
        totalPaid: 3000,
        outstanding: 2000,
      });

      const result = await service.getSupplierBalance('sup-1');
      expect(result.outstanding).toBe(2000);
    });
  });

  describe('getSupplierPayments', () => {
    it('should return payment history', async () => {
      repository.findBySupplierId.mockResolvedValue([mockPayment] as any);
      const result = await service.getSupplierPayments('sup-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getAllSuppliersWithOutstanding', () => {
    it('should return suppliers with outstanding balance', async () => {
      repository.getAllSuppliersWithOutstanding.mockResolvedValue([
        {
          supplierId: 'sup-1',
          totalCost: 1000,
          totalPaid: 500,
          outstanding: 500,
        },
      ]);
      const result = await service.getAllSuppliersWithOutstanding();
      expect(result).toHaveLength(1);
      expect(result[0].outstanding).toBe(500);
    });
  });
});
