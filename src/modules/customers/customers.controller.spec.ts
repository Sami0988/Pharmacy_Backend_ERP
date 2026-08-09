import { Test, TestingModule } from '@nestjs/testing';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

describe('CustomersController', () => {
  let controller: CustomersController;
  let service: jest.Mocked<CustomersService>;

  const mockCustomer = {
    id: 'cust-1',
    name: 'John Doe',
    phone: '+256700000000',
    creditBalance: '0',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      getHistory: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [{ provide: CustomersService, useValue: service }],
    }).compile();

    controller = module.get<CustomersController>(CustomersController);
  });

  describe('findAll', () => {
    it('should call service findAll with search param', async () => {
      service.findAll.mockResolvedValue([mockCustomer]);
      const result = await controller.findAll('John');
      expect(service.findAll).toHaveBeenCalledWith('John');
      expect(result).toHaveLength(1);
    });

    it('should call service findAll without search', async () => {
      service.findAll.mockResolvedValue([mockCustomer]);
      await controller.findAll(undefined);
      expect(service.findAll).toHaveBeenCalledWith(undefined);
    });
  });

  describe('findOne', () => {
    it('should call service findOne with id', async () => {
      service.findOne.mockResolvedValue(mockCustomer);
      const result = await controller.findOne('cust-1');
      expect(result.id).toBe('cust-1');
      expect(service.findOne).toHaveBeenCalledWith('cust-1');
    });
  });

  describe('getHistory', () => {
    it('should call service getHistory', async () => {
      service.getHistory.mockResolvedValue([{ id: 'sale-1' }] as any);
      const result = await controller.getHistory('cust-1');
      expect(service.getHistory).toHaveBeenCalledWith('cust-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should call service create with dto', async () => {
      service.create.mockResolvedValue(mockCustomer);
      const dto = { name: 'John Doe', phone: '+256700000000' };
      const result = await controller.create(dto);
      expect(result.id).toBe('cust-1');
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should call service update with id and dto', async () => {
      service.update.mockResolvedValue(mockCustomer);
      const dto = { name: 'Jane Doe' };
      const result = await controller.update('cust-1', dto);
      expect(result.id).toBe('cust-1');
      expect(service.update).toHaveBeenCalledWith('cust-1', dto);
    });
  });
});
