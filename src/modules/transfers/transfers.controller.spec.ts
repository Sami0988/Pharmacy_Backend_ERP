import { Test, TestingModule } from '@nestjs/testing';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

describe('TransfersController', () => {
  let controller: TransfersController;
  let service: jest.Mocked<TransfersService>;

  beforeEach(async () => {
    service = {
      getFefoSuggestions: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransfersController],
      providers: [{ provide: TransfersService, useValue: service }],
    }).compile();

    controller = module.get<TransfersController>(TransfersController);
  });

  describe('getFefoSuggestions', () => {
    it('should call service with correct params', async () => {
      service.getFefoSuggestions.mockResolvedValue({
        itemId: 'item-1',
        locationId: 'loc-1',
        quantityNeeded: 20,
        suggestions: [],
        totalAvailable: 0,
      });

      const result = await controller.getFefoSuggestions({
        itemId: 'item-1',
        locationId: 'loc-1',
        quantityNeeded: 20,
      });

      expect(service.getFefoSuggestions).toHaveBeenCalledWith(
        'item-1',
        'loc-1',
        20,
      );
      expect(result.totalAvailable).toBe(0);
    });
  });

  describe('create', () => {
    it('should call service create', async () => {
      service.create.mockResolvedValue({
        id: 'transfer-1',
        quantities: [],
      } as any);

      const dto = {
        batchId: 'batch-1',
        quantity: 10,
        fromLocationId: 'store-1',
        toLocationId: 'disp-1',
      };

      const result = await controller.create(dto, 'user-1');
      expect(result.id).toBe('transfer-1');
      expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  describe('findAll', () => {
    it('should pass query params to service', async () => {
      service.findAll.mockResolvedValue([]);
      await controller.findAll(
        '0',
        '10',
        'batch-1',
        undefined,
        undefined,
        undefined,
      );
      expect(service.findAll).toHaveBeenCalledWith({
        offset: 0,
        limit: 10,
        batchId: 'batch-1',
        itemId: undefined,
        fromDate: undefined,
        toDate: undefined,
      });
    });
  });

  describe('findOne', () => {
    it('should call service findById', async () => {
      service.findById.mockResolvedValue({ id: 'transfer-1' } as any);
      const result = await controller.findOne('transfer-1');
      expect(result.id).toBe('transfer-1');
    });
  });
});
