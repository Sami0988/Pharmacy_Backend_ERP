import { Test, TestingModule } from '@nestjs/testing';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';

describe('GoodsReceiptsController', () => {
  let controller: GoodsReceiptsController;
  let service: jest.Mocked<GoodsReceiptsService>;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      getInvoiceUrl: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoodsReceiptsController],
      providers: [{ provide: GoodsReceiptsService, useValue: service }],
    }).compile();

    controller = module.get<GoodsReceiptsController>(GoodsReceiptsController);
  });

  describe('create', () => {
    it('should parse items from JSON string', async () => {
      service.create.mockResolvedValue({ id: 'grn-1' } as any);
      const body = {
        supplierId: 'sup-1',
        branchId: 'branch-1',
        grnNumber: 'GRN-001',
        receiptDate: '2026-08-03',
        items: JSON.stringify([
          {
            itemId: 'item-1',
            batchNo: 'B001',
            expiryDate: '2027-08-03',
            quantityReceived: 100,
            unitCost: 10,
          },
        ]),
      };
      await controller.create(body, undefined, 'user-1');
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ itemId: 'item-1', batchNo: 'B001' }),
          ]),
        }),
        undefined,
        'user-1',
      );
    });

    it('should pass file to service', async () => {
      service.create.mockResolvedValue({ id: 'grn-1' } as any);
      const file = { buffer: Buffer.from('test') } as Express.Multer.File;
      const body = {
        supplierId: 'sup-1',
        branchId: 'branch-1',
        grnNumber: 'GRN-001',
        receiptDate: '2026-08-03',
        items: '[]',
      };
      await controller.create(body, file, 'user-1');
      expect(service.create).toHaveBeenCalledWith(
        expect.anything(),
        file,
        'user-1',
      );
    });
  });

  describe('findAll', () => {
    it('should call service findAll', async () => {
      service.findAll.mockResolvedValue([]);
      await controller.findAll('sup-1', 'br-1', '0', '10');
      expect(service.findAll).toHaveBeenCalledWith({
        supplierId: 'sup-1',
        branchId: 'br-1',
        offset: 0,
        limit: 10,
      });
    });
  });

  describe('findOne', () => {
    it('should call service findById', async () => {
      service.findById.mockResolvedValue({ id: 'grn-1' } as any);
      await controller.findOne('grn-1');
      expect(service.findById).toHaveBeenCalledWith('grn-1');
    });
  });

  describe('getInvoiceUrl', () => {
    it('should return signed URL', async () => {
      service.getInvoiceUrl.mockResolvedValue('http://url');
      const result = await controller.getInvoiceUrl('grn-1');
      expect(result).toEqual({ url: 'http://url' });
    });
  });
});
