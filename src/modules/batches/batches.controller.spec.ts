import { Test, TestingModule } from '@nestjs/testing';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';

describe('BatchesController', () => {
  let controller: BatchesController;
  let service: jest.Mocked<BatchesService>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      getQrCodeUrl: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchesController],
      providers: [{ provide: BatchesService, useValue: service }],
    }).compile();

    controller = module.get<BatchesController>(BatchesController);
  });

  describe('findAll', () => {
    it('should call service with parsed params', async () => {
      service.findAll.mockResolvedValue([]);
      await controller.findAll('item-1', '30', '0', '10');
      expect(service.findAll).toHaveBeenCalledWith({
        itemId: 'item-1',
        expiringWithinDays: 30,
        offset: 0,
        limit: 10,
      });
    });

    it('should handle undefined params', async () => {
      service.findAll.mockResolvedValue([]);
      await controller.findAll(undefined, undefined, undefined, undefined);
      expect(service.findAll).toHaveBeenCalledWith({
        itemId: undefined,
        expiringWithinDays: undefined,
        offset: undefined,
        limit: undefined,
      });
    });
  });

  describe('findOne', () => {
    it('should call service findById', async () => {
      service.findById.mockResolvedValue({ id: 'batch-1' } as any);
      await controller.findOne('batch-1');
      expect(service.findById).toHaveBeenCalledWith('batch-1');
    });
  });

  describe('getQrCode', () => {
    it('should return QR code URL', async () => {
      service.getQrCodeUrl.mockResolvedValue('http://qr-url');
      const result = await controller.getQrCode('batch-1');
      expect(result).toEqual({ url: 'http://qr-url' });
    });
  });
});
