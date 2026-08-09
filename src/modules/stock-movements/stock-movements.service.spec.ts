import { Test, TestingModule } from '@nestjs/testing';
import { StockMovementsService } from './stock-movements.service';
import { StockMovementsRepository } from './stock-movements.repository';

describe('StockMovementsService', () => {
  let service: StockMovementsService;
  let repository: jest.Mocked<StockMovementsRepository>;

  beforeEach(async () => {
    repository = {
      record: jest.fn(),
      getCurrentQuantity: jest.fn(),
      getBatchQuantitiesByLocation: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockMovementsService,
        { provide: StockMovementsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<StockMovementsService>(StockMovementsService);
  });

  describe('record', () => {
    it('should call repository record', async () => {
      await service.record({
        batchId: 'b1',
        locationId: 'l1',
        type: 'receipt',
        quantity: 100,
        refId: 'grn1',
        refType: 'goods_receipt',
        createdBy: 'u1',
      });
      expect(repository.record).toHaveBeenCalledWith({
        batchId: 'b1',
        locationId: 'l1',
        type: 'receipt',
        quantity: 100,
        refId: 'grn1',
        refType: 'goods_receipt',
        createdBy: 'u1',
      });
    });
  });

  describe('getCurrentQuantity', () => {
    it('should return quantity', async () => {
      repository.getCurrentQuantity.mockResolvedValue(100);
      const result = await service.getCurrentQuantity('b1', 'l1');
      expect(result).toBe(100);
    });

    it('should return 0 when no movements', async () => {
      repository.getCurrentQuantity.mockResolvedValue(0);
      const result = await service.getCurrentQuantity('b1', 'l1');
      expect(result).toBe(0);
    });
  });

  describe('getBatchQuantitiesByLocation', () => {
    it('should return quantities by location', async () => {
      const mockData = [
        { locationId: 'l1', quantity: 100 },
        { locationId: 'l2', quantity: 50 },
      ];
      repository.getBatchQuantitiesByLocation.mockResolvedValue(mockData);
      const result = await service.getBatchQuantitiesByLocation('b1');
      expect(result).toEqual(mockData);
    });
  });
});
