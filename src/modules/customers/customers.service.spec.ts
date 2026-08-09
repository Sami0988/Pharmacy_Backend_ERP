import { Test, TestingModule } from '@nestjs/testing';
import { CustomersService } from './customers.service';
import { CustomersRepository } from './customers.repository';
import { NotFoundException } from '@nestjs/common';

describe('CustomersService', () => {
  let service: CustomersService;
  let repository: jest.Mocked<CustomersRepository>;

  const mockCustomer = {
    id: 'cust-1',
    name: 'John Doe',
    phone: '+256700000000',
    creditBalance: '0',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      incrementCreditBalance: jest.fn(),
      getCustomerSales: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: CustomersRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  describe('findAll', () => {
    it('should return all customers', async () => {
      repository.findAll.mockResolvedValue([mockCustomer]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(repository.findAll).toHaveBeenCalledWith(undefined);
    });

    it('should pass search param to repository', async () => {
      repository.findAll.mockResolvedValue([mockCustomer]);
      await service.findAll('John');
      expect(repository.findAll).toHaveBeenCalledWith('John');
    });
  });

  describe('findOne', () => {
    it('should return a customer by id', async () => {
      repository.findById.mockResolvedValue(mockCustomer);
      const result = await service.findOne('cust-1');
      expect(result.id).toBe('cust-1');
    });

    it('should throw NotFoundException for non-existent customer', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a customer with name and phone', async () => {
      repository.create.mockResolvedValue(mockCustomer);
      const result = await service.create({
        name: 'John Doe',
        phone: '+256700000000',
      });
      expect(result.id).toBe('cust-1');
      expect(repository.create).toHaveBeenCalledWith({
        name: 'John Doe',
        phone: '+256700000000',
      });
    });
  });

  describe('update', () => {
    it('should update a customer', async () => {
      repository.findById.mockResolvedValue(mockCustomer);
      repository.update.mockResolvedValue({
        ...mockCustomer,
        name: 'Jane Doe',
      });
      const result = await service.update('cust-1', { name: 'Jane Doe' });
      expect(result.name).toBe('Jane Doe');
    });

    it('should throw NotFoundException for non-existent customer', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.update('bad-id', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should only include provided fields in update', async () => {
      repository.findById.mockResolvedValue(mockCustomer);
      repository.update.mockResolvedValue(mockCustomer);
      await service.update('cust-1', { phone: '+256711111111' });
      expect(repository.update).toHaveBeenCalledWith('cust-1', {
        phone: '+256711111111',
      });
    });
  });

  describe('getHistory', () => {
    it('should return sales history for a customer', async () => {
      repository.findById.mockResolvedValue(mockCustomer);
      repository.getCustomerSales.mockResolvedValue([
        { id: 'sale-1', totalAmount: '5000' },
      ] as any);
      const result = await service.getHistory('cust-1');
      expect(result).toHaveLength(1);
      expect(repository.getCustomerSales).toHaveBeenCalledWith('cust-1');
    });

    it('should throw NotFoundException for non-existent customer', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getHistory('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
