import { Test, TestingModule } from '@nestjs/testing';
import { TraceabilityController } from './traceability.controller';
import { TraceabilityService } from './traceability.service';

describe('TraceabilityController', () => {
  let controller: TraceabilityController;
  let service: jest.Mocked<TraceabilityService>;

  beforeEach(async () => {
    service = {
      traceByBatchNo: jest.fn(),
      traceByBatchId: jest.fn(),
      getRecallImpact: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TraceabilityController],
      providers: [{ provide: TraceabilityService, useValue: service }],
    }).compile();

    controller = module.get<TraceabilityController>(TraceabilityController);
  });

  describe('traceByBatchNo', () => {
    it('should call service with batchNo', async () => {
      service.traceByBatchNo.mockResolvedValue([{ batchNo: 'BATCH-001' }] as any);
      const result = await controller.traceByBatchNo('BATCH-001');
      expect(service.traceByBatchNo).toHaveBeenCalledWith('BATCH-001');
      expect(result).toHaveLength(1);
    });
  });

  describe('traceByBatchId', () => {
    it('should call service with batchId', async () => {
      service.traceByBatchId.mockResolvedValue({ batchId: 'batch-1' } as any);
      const result = await controller.traceByBatchId('batch-1');
      expect(service.traceByBatchId).toHaveBeenCalledWith('batch-1');
      expect(result.batchId).toBe('batch-1');
    });
  });

  describe('getRecallImpact', () => {
    it('should call service with batchId', async () => {
      service.getRecallImpact.mockResolvedValue({
        batchId: 'batch-1',
        totalSold: 50,
      } as any);
      const result = await controller.getRecallImpact('batch-1');
      expect(service.getRecallImpact).toHaveBeenCalledWith('batch-1');
      expect(result.totalSold).toBe(50);
    });
  });
});
