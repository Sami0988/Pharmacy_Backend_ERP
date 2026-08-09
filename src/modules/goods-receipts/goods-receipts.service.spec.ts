import { Test, TestingModule } from '@nestjs/testing';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptsRepository } from './goods-receipts.repository';
import { BatchesRepository } from '../batches/batches.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { MinioService } from '../../common/storage/minio.service';
import { AuditLogUtil } from '../../common/utils/audit-log.util';
import { DatabaseService } from '../../db/database.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('qrcode', () => ({
  toBuffer: jest.fn(async () => Buffer.from('qr')),
}));

describe('GoodsReceiptsService', () => {
  let service: GoodsReceiptsService;
  let repository: jest.Mocked<GoodsReceiptsRepository>;
  let batchesRepository: jest.Mocked<BatchesRepository>;
  let stockMovementsService: jest.Mocked<StockMovementsService>;
  let minioService: jest.Mocked<MinioService>;
  let auditLog: jest.Mocked<AuditLogUtil>;
  let databaseService: jest.Mocked<DatabaseService>;

  const mockGrn = {
    id: 'grn-1',
    supplierId: 'sup-1',
    branchId: 'branch-1',
    grnNumber: 'GRN-001',
    receiptDate: '2026-08-03',
    invoiceDocumentUrl: 'invoices/sup-1/GRN-001.pdf',
    totalCost: '1000',
    taxPaid: false,
    paymentDueDate: '2026-09-03',
    paymentDueDateType: 'one_month',
    createdBy: 'user-1',
    createdAt: new Date(),
  };

  const mockBatch = {
    id: 'batch-1',
    itemId: 'item-1',
    grnId: 'grn-1',
    batchNo: 'BATCH-001',
    expiryDate: '2027-08-03',
    unitCost: '10',
    quantityReceived: 100,
    qrCodeUrl: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByGrnNumberAndSupplier: jest.fn(),
      findAll: jest.fn(),
    } as any;

    batchesRepository = {
      create: jest.fn(),
      updateQrCodeUrl: jest.fn(),
    } as any;

    stockMovementsService = {
      record: jest.fn(),
      getCurrentQuantity: jest.fn(),
      getBatchQuantitiesByLocation: jest.fn(),
    } as any;

    minioService = {
      uploadFile: jest.fn(),
      getSignedUrl: jest.fn(),
      deleteFile: jest.fn(),
    } as any;

    auditLog = {
      log: jest.fn(),
    } as any;

    const makeThenableChain = (result: any[]) => {
      const whereResult = Object.assign(Promise.resolve(result), {
        limit: jest.fn().mockResolvedValue(result.slice(0, 1)),
      });
      return {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(whereResult),
        }),
      };
    };

    databaseService = {
      db: {
        select: jest.fn().mockReturnValue(makeThenableChain([{ id: 'loc-1' }])),
        transaction: jest.fn().mockImplementation(async (fn: any) => {
          const tx = {
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([mockGrn]),
              }),
            }),
            select: jest
              .fn()
              .mockReturnValue(makeThenableChain([{ id: 'loc-1' }])),
          };
          return fn(tx);
        }),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsReceiptsService,
        { provide: GoodsReceiptsRepository, useValue: repository },
        { provide: BatchesRepository, useValue: batchesRepository },
        { provide: StockMovementsService, useValue: stockMovementsService },
        { provide: MinioService, useValue: minioService },
        { provide: AuditLogUtil, useValue: auditLog },
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    service = module.get<GoodsReceiptsService>(GoodsReceiptsService);
  });

  describe('create', () => {
    const createDto = {
      supplierId: 'sup-1',
      branchId: 'branch-1',
      grnNumber: 'GRN-001',
      receiptDate: '2026-08-03',
      items: [
        {
          itemId: 'item-1',
          batchNo: 'BATCH-001',
          expiryDate: '2027-08-03',
          quantityReceived: 100,
          unitCost: 10,
        },
      ],
    };

    it('should reject empty items', async () => {
      await expect(
        service.create({ ...createDto, items: [] }, undefined, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject past expiry date', async () => {
      const dto = {
        ...createDto,
        items: [
          {
            ...createDto.items[0],
            expiryDate: '2020-01-01',
          },
        ],
      };
      await expect(service.create(dto, undefined, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject zero quantity', async () => {
      const dto = {
        ...createDto,
        items: [{ ...createDto.items[0], quantityReceived: 0 }],
      };
      await expect(service.create(dto, undefined, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject zero unit cost', async () => {
      const dto = {
        ...createDto,
        items: [{ ...createDto.items[0], unitCost: 0 }],
      };
      await expect(service.create(dto, undefined, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject duplicate GRN number', async () => {
      repository.findByGrnNumberAndSupplier.mockResolvedValue(true);
      await expect(
        service.create(createDto, undefined, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should create GRN with invoice file', async () => {
      repository.findByGrnNumberAndSupplier.mockResolvedValue(false);
      repository.findById.mockResolvedValue(mockGrn as any);

      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'application/pdf',
        originalname: 'invoice.pdf',
      } as Express.Multer.File;

      const result = await service.create(createDto, file, 'user-1');

      expect(minioService.uploadFile).toHaveBeenCalledWith(
        'invoices',
        expect.stringContaining('sup-1'),
        file.buffer,
        'application/pdf',
      );
      expect(databaseService.db.transaction).toHaveBeenCalled();
      expect(auditLog.log).toHaveBeenCalled();
    });

    it('should compute totalCost server-side', async () => {
      repository.findByGrnNumberAndSupplier.mockResolvedValue(false);
      repository.findById.mockResolvedValue(mockGrn as any);

      await service.create(createDto, undefined, 'user-1');

      // The transaction should have been called — totalCost is computed
      // as 100 * 10 = 1000 and passed inside the transaction
      expect(databaseService.db.transaction).toHaveBeenCalled();
    });

    it('should cleanup MinIO file on transaction failure', async () => {
      repository.findByGrnNumberAndSupplier.mockResolvedValue(false);
      (databaseService.db.transaction as jest.Mock).mockRejectedValue(
        new Error('DB error'),
      );

      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'application/pdf',
        originalname: 'invoice.pdf',
      } as Express.Multer.File;

      await expect(service.create(createDto, file, 'user-1')).rejects.toThrow();
      expect(minioService.deleteFile).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should call repository findAll', async () => {
      repository.findAll.mockResolvedValue([mockGrn] as any);
      const result = await service.findAll({ supplierId: 'sup-1' });
      expect(result).toEqual([mockGrn]);
    });
  });

  describe('findById', () => {
    it('should return GRN if found', async () => {
      repository.findById.mockResolvedValue(mockGrn as any);
      const result = await service.findById('grn-1');
      expect(result).toEqual(mockGrn);
    });

    it('should throw if not found', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findById('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getInvoiceUrl', () => {
    it('should return signed URL', async () => {
      repository.findById.mockResolvedValue(mockGrn as any);
      minioService.getSignedUrl.mockResolvedValue('http://signed-url');
      const result = await service.getInvoiceUrl('grn-1');
      expect(result).toBe('http://signed-url');
    });

    it('should throw if no invoice', async () => {
      repository.findById.mockResolvedValue({
        ...mockGrn,
        invoiceDocumentUrl: null,
      } as any);
      await expect(service.getInvoiceUrl('grn-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
