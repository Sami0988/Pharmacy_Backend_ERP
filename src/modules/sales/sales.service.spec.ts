import { Test, TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { SalesRepository } from './sales.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { TransfersService } from '../transfers/transfers.service';
import { CustomersService } from '../customers/customers.service';
import { DatabaseService } from '../../db/database.service';
import { AuditLogUtil } from '../../common/utils/audit-log.util';
import { ReceiptPdfService } from '../../common/pdf/receipt-pdf.service';
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

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

describe('SalesService', () => {
  let service: SalesService;
  let repository: jest.Mocked<SalesRepository>;
  let stockMovementsService: jest.Mocked<StockMovementsService>;
  let transfersService: jest.Mocked<TransfersService>;
  let customersService: jest.Mocked<CustomersService>;
  let databaseService: jest.Mocked<DatabaseService>;
  let auditLog: jest.Mocked<AuditLogUtil>;
  let receiptPdfService: jest.Mocked<ReceiptPdfService>;

  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const mockDispatcherLocation = { id: 'disp-1', branchId: 'branch-1', name: 'Dispatcher', createdAt: new Date() };
  const mockItem = { id: 'item-1', name: 'Paracetamol 500mg', genericName: 'Paracetamol', category: 'Analgesics', unit: 'tablet', strength: '500mg', sellingPrice: '5000', reorderLevel: 10, isControlledSubstance: false, createdAt: new Date() };
  const mockBatch = { id: 'batch-1', itemId: 'item-1', grnId: 'grn-1', batchNo: 'BATCH-001', expiryDate: futureDate, unitCost: '3000', quantityReceived: 100, qrCodeUrl: null, createdAt: new Date() };
  const mockSale = { id: 'sale-1', branchId: 'branch-1', customerId: null, soldBy: 'user-1', totalAmount: '10000', paymentMethod: 'cash', receiptUrl: null, receiptGenerated: true, createdAt: new Date() };
  const mockSaleItem = { id: 'si-1', saleId: 'sale-1', batchId: 'batch-1', quantity: 2, unitPrice: '5000', createdAt: new Date() };

  function buildDbMock(overrides: {
    locationResult?: any[];
    itemResult?: any[];
    batchResult?: any[];
    saleResult?: any[];
  } = {}) {
    const locationResult = overrides.locationResult ?? [mockDispatcherLocation];
    const itemResult = overrides.itemResult ?? [mockItem];
    const batchResult = overrides.batchResult ?? [mockBatch];
    const saleResult = overrides.saleResult ?? [mockSale];

    function makeChain(resolveWith: any) {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(resolveWith),
        innerJoin: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
      return chain;
    }

    // Each select() call returns a fresh chain; we track call order
    const selectResults: any[] = [];
    let selectIndex = 0;

    const dbMock = {
      db: {
        select: jest.fn().mockImplementation(() => {
          if (selectIndex < selectResults.length) {
            return selectResults[selectIndex++];
          }
          return makeChain([]);
        }),
        transaction: jest.fn().mockImplementation(async (fn: any) => {
          const tx = {
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([mockSale]),
              }),
            }),
          };
          return fn(tx);
        }),
      },
    };

    // Helper to enqueue expected results in order of select() calls
    dbMock.db.select
      .mockImplementationOnce(() => makeChain(locationResult))   // findDispatcherLocation
      .mockImplementationOnce(() => makeChain(itemResult))       // getItemById (item lookup)
      .mockImplementationOnce(() => makeChain(batchResult))      // findBatchById
      .mockImplementationOnce(() => makeChain(saleResult))       // repository.findById (receipt)
      .mockImplementation(() => makeChain([]));                  // fallback

    return dbMock as any;
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    repository = {
      findById: jest.fn(),
      findSaleItemById: jest.fn(),
      getReturnableQuantity: jest.fn(),
      createSaleReturn: jest.fn(),
      updateReceiptUrl: jest.fn(),
      findAll: jest.fn(),
    } as any;

    stockMovementsService = {
      getCurrentQuantity: jest.fn(),
      record: jest.fn(),
    } as any;

    transfersService = {
      getFefoSuggestions: jest.fn(),
    } as any;

    customersService = {
      findOne: jest.fn(),
    } as any;

    auditLog = { log: jest.fn() } as any;

    receiptPdfService = {
      generateReceipt: jest.fn(),
      getSignedUrl: jest.fn(),
    } as any;

    databaseService = buildDbMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: SalesRepository, useValue: repository },
        { provide: StockMovementsService, useValue: stockMovementsService },
        { provide: TransfersService, useValue: transfersService },
        { provide: CustomersService, useValue: customersService },
        { provide: DatabaseService, useValue: databaseService },
        { provide: AuditLogUtil, useValue: auditLog },
        { provide: ReceiptPdfService, useValue: receiptPdfService },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  describe('create', () => {
    const baseDto = {
      branchId: 'branch-1',
      paymentMethod: 'cash',
      items: [{ itemId: 'item-1', quantity: 2 }],
    };

    it('should reject empty items array', async () => {
      await expect(
        service.create({ ...baseDto, items: [] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject credit sale without customerId', async () => {
      await expect(
        service.create(
          { ...baseDto, paymentMethod: 'credit', items: [{ itemId: 'item-1', quantity: 2 }] },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate customer exists when customerId provided', async () => {
      customersService.findOne.mockResolvedValue({ id: 'cust-1' } as any);

      transfersService.getFefoSuggestions.mockResolvedValue({
        suggestions: [{ batchId: 'batch-1' }],
        totalAvailable: 100,
      });
      stockMovementsService.getCurrentQuantity.mockResolvedValue(50);
      receiptPdfService.generateReceipt.mockResolvedValue('receipts/sale-1.pdf');
      repository.findById.mockResolvedValue(mockSale as any);

      await service.create({ ...baseDto, customerId: 'cust-1' }, 'user-1');
      expect(customersService.findOne).toHaveBeenCalledWith('cust-1');
    });

    it('should throw when no Dispatcher location found', async () => {
      databaseService = buildDbMock({ locationResult: [] });
      const module2 = await Test.createTestingModule({
        providers: [
          SalesService,
          { provide: SalesRepository, useValue: repository },
          { provide: StockMovementsService, useValue: stockMovementsService },
          { provide: TransfersService, useValue: transfersService },
          { provide: CustomersService, useValue: customersService },
          { provide: DatabaseService, useValue: databaseService },
          { provide: AuditLogUtil, useValue: auditLog },
          { provide: ReceiptPdfService, useValue: receiptPdfService },
        ],
      }).compile();
      const svc = module2.get<SalesService>(SalesService);

      await expect(svc.create(baseDto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject item with no selling price', async () => {
      databaseService = buildDbMock({
        itemResult: [{ ...mockItem, sellingPrice: null }],
      });
      const module2 = await Test.createTestingModule({
        providers: [
          SalesService,
          { provide: SalesRepository, useValue: repository },
          { provide: StockMovementsService, useValue: stockMovementsService },
          { provide: TransfersService, useValue: transfersService },
          { provide: CustomersService, useValue: customersService },
          { provide: DatabaseService, useValue: databaseService },
          { provide: AuditLogUtil, useValue: auditLog },
          { provide: ReceiptPdfService, useValue: receiptPdfService },
        ],
      }).compile();
      const svc = module2.get<SalesService>(SalesService);

      await expect(svc.create(baseDto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when FEFO returns no suggestions (zero stock)', async () => {
      transfersService.getFefoSuggestions.mockResolvedValue({
        suggestions: [],
        totalAvailable: 0,
      });
      databaseService = buildDbMock({ itemResult: [mockItem], batchResult: [] });
      const module2 = await Test.createTestingModule({
        providers: [
          SalesService,
          { provide: SalesRepository, useValue: repository },
          { provide: StockMovementsService, useValue: stockMovementsService },
          { provide: TransfersService, useValue: transfersService },
          { provide: CustomersService, useValue: customersService },
          { provide: DatabaseService, useValue: databaseService },
          { provide: AuditLogUtil, useValue: auditLog },
          { provide: ReceiptPdfService, useValue: receiptPdfService },
        ],
      }).compile();
      const svc = module2.get<SalesService>(SalesService);

      await expect(svc.create(baseDto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject expired batch', async () => {
      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      databaseService = buildDbMock({
        batchResult: [{ ...mockBatch, expiryDate: pastDate }],
      });
      const module2 = await Test.createTestingModule({
        providers: [
          SalesService,
          { provide: SalesRepository, useValue: repository },
          { provide: StockMovementsService, useValue: stockMovementsService },
          { provide: TransfersService, useValue: transfersService },
          { provide: CustomersService, useValue: customersService },
          { provide: DatabaseService, useValue: databaseService },
          { provide: AuditLogUtil, useValue: auditLog },
          { provide: ReceiptPdfService, useValue: receiptPdfService },
        ],
      }).compile();
      const svc = module2.get<SalesService>(SalesService);

      transfersService.getFefoSuggestions.mockResolvedValue({
        suggestions: [{ batchId: 'batch-1' }],
        totalAvailable: 50,
      });

      await expect(svc.create(baseDto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject insufficient stock', async () => {
      transfersService.getFefoSuggestions.mockResolvedValue({
        suggestions: [{ batchId: 'batch-1' }],
        totalAvailable: 50,
      });
      stockMovementsService.getCurrentQuantity.mockResolvedValue(1);

      await expect(service.create(baseDto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject non-integer quantity', async () => {
      await expect(
        service.create(
          { ...baseDto, items: [{ itemId: 'item-1', quantity: 1.5 }] },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create sale with computed totalAmount', async () => {
      transfersService.getFefoSuggestions.mockResolvedValue({
        suggestions: [{ batchId: 'batch-1' }],
        totalAvailable: 50,
      });
      stockMovementsService.getCurrentQuantity.mockResolvedValue(50);
      receiptPdfService.generateReceipt.mockResolvedValue('receipts/sale-1.pdf');
      repository.findById.mockResolvedValue(mockSale as any);

      const result = await service.create(baseDto, 'user-1');
      expect(result.totalAmount).toBe(10000);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create_sale' }),
      );
    });

    it('should use manually specified batchId', async () => {
      transfersService.getFefoSuggestions.mockResolvedValue({
        suggestions: [{ batchId: 'batch-1' }],
        totalAvailable: 50,
      });
      stockMovementsService.getCurrentQuantity.mockResolvedValue(50);
      receiptPdfService.generateReceipt.mockResolvedValue('receipts/sale-1.pdf');
      repository.findById.mockResolvedValue(mockSale as any);

      const dto = {
        ...baseDto,
        items: [{ itemId: 'item-1', quantity: 2, batchId: 'batch-1' }],
      };
      const result = await service.create(dto, 'user-1');
      expect(result.totalAmount).toBe(10000);
      expect(transfersService.getFefoSuggestions).not.toHaveBeenCalled();
    });

    it('should record stock movements for each line item', async () => {
      transfersService.getFefoSuggestions.mockResolvedValue({
        suggestions: [{ batchId: 'batch-1' }],
        totalAvailable: 50,
      });
      stockMovementsService.getCurrentQuantity.mockResolvedValue(50);
      receiptPdfService.generateReceipt.mockResolvedValue('receipts/sale-1.pdf');
      repository.findById.mockResolvedValue(mockSale as any);

      await service.create(baseDto, 'user-1');
      expect(stockMovementsService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: 'batch-1',
          type: 'sale',
          quantity: -2,
          refType: 'sale',
        }),
      );
    });

    it('should not fail if receipt generation fails', async () => {
      transfersService.getFefoSuggestions.mockResolvedValue({
        suggestions: [{ batchId: 'batch-1' }],
        totalAvailable: 50,
      });
      stockMovementsService.getCurrentQuantity.mockResolvedValue(50);
      receiptPdfService.generateReceipt.mockRejectedValue(new Error('PDF fail'));
      repository.findById.mockResolvedValue(mockSale as any);

      const result = await service.create(baseDto, 'user-1');
      expect(result).toBeDefined();
      expect(repository.updateReceiptUrl).toHaveBeenCalledWith(
        'sale-1',
        null,
      );
    });
  });

  describe('createReturn', () => {
    const mockSaleItemRecord = {
      id: 'si-1',
      saleId: 'sale-1',
      batchId: 'batch-1',
      quantity: 5,
      unitPrice: '5000',
      batchNo: 'BATCH-001',
      itemName: 'Paracetamol 500mg',
      itemId: 'item-1',
    };

    it('should throw if sale item not found', async () => {
      repository.findSaleItemById.mockResolvedValue(null);
      await expect(
        service.createReturn(
          'sale-1',
          { saleItemId: 'si-1', quantity: 1, reason: 'Defective' },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if sale item belongs to different sale', async () => {
      repository.findSaleItemById.mockResolvedValue({
        ...mockSaleItemRecord,
        saleId: 'other-sale',
      });
      await expect(
        service.createReturn(
          'sale-1',
          { saleItemId: 'si-1', quantity: 1, reason: 'Defective' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if return quantity exceeds returnable', async () => {
      repository.findSaleItemById.mockResolvedValue(mockSaleItemRecord);
      repository.getReturnableQuantity.mockResolvedValue(2);

      await expect(
        service.createReturn(
          'sale-1',
          { saleItemId: 'si-1', quantity: 5, reason: 'Too many' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create return and record stock movement', async () => {
      repository.findSaleItemById.mockResolvedValue(mockSaleItemRecord);
      repository.getReturnableQuantity.mockResolvedValue(5);
      repository.findById.mockResolvedValue({
        id: 'sale-1',
        branchId: 'branch-1',
      } as any);
      repository.createSaleReturn.mockResolvedValue({
        id: 'return-1',
        saleItemId: 'si-1',
        quantity: 2,
        reason: 'Defective',
        processedBy: 'user-1',
        createdAt: new Date(),
      });

      // Mock findDispatcherLocation via db.select chain
      databaseService.db.select.mockImplementation(() => {
        const chain: any = {
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([mockDispatcherLocation]),
        };
        return chain;
      });

      const result = await service.createReturn(
        'sale-1',
        { saleItemId: 'si-1', quantity: 2, reason: 'Defective' },
        'user-1',
      );

      expect(result.id).toBe('return-1');
      expect(stockMovementsService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: 'batch-1',
          type: 'sale_return',
          quantity: 2,
        }),
      );
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create_sale_return' }),
      );
    });
  });

  describe('findById', () => {
    it('should return a sale by id', async () => {
      repository.findById.mockResolvedValue(mockSale as any);
      const result = await service.findById('sale-1');
      expect(result.id).toBe('sale-1');
    });

    it('should throw NotFoundException for non-existent sale', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findById('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated sales', async () => {
      repository.findAll.mockResolvedValue([mockSale] as any);
      const result = await service.findAll({ offset: 0, limit: 10 });
      expect(result).toHaveLength(1);
      expect(repository.findAll).toHaveBeenCalledWith({
        offset: 0,
        limit: 10,
        branchId: undefined,
        customerId: undefined,
        soldBy: undefined,
        fromDate: undefined,
        toDate: undefined,
      });
    });

    it('should use default pagination', async () => {
      repository.findAll.mockResolvedValue([]);
      await service.findAll({});
      expect(repository.findAll).toHaveBeenCalledWith({
        offset: 0,
        limit: 20,
        branchId: undefined,
        customerId: undefined,
        soldBy: undefined,
        fromDate: undefined,
        toDate: undefined,
      });
    });
  });

  describe('getReceiptUrl', () => {
    it('should return signed URL for sale with receipt', async () => {
      repository.findById.mockResolvedValue({
        ...mockSale,
        receiptUrl: 'receipts/sale-1.pdf',
      } as any);
      receiptPdfService.getSignedUrl.mockResolvedValue('https://minio/receipt.pdf');
      const result = await service.getReceiptUrl('sale-1');
      expect(result).toBe('https://minio/receipt.pdf');
    });

    it('should throw if no receipt available', async () => {
      repository.findById.mockResolvedValue({
        ...mockSale,
        receiptUrl: null,
      } as any);
      await expect(service.getReceiptUrl('sale-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('regenerateReceipt', () => {
    it('should regenerate receipt and update url', async () => {
      repository.findById.mockResolvedValue(mockSale as any);
      receiptPdfService.generateReceipt.mockResolvedValue('receipts/sale-1-v2.pdf');
      const result = await service.regenerateReceipt('sale-1');
      expect(result.receiptUrl).toBe('receipts/sale-1-v2.pdf');
      expect(repository.updateReceiptUrl).toHaveBeenCalledWith(
        'sale-1',
        'receipts/sale-1-v2.pdf',
      );
    });

    it('should throw ServiceUnavailableException on PDF failure', async () => {
      repository.findById.mockResolvedValue(mockSale as any);
      receiptPdfService.generateReceipt.mockRejectedValue(new Error('PDF fail'));
      await expect(service.regenerateReceipt('sale-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
