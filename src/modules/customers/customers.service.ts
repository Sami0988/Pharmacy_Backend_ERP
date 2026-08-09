import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomersRepository } from './customers.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaginatedResponse } from '../../common/pagination';

@Injectable()
export class CustomersService {
  constructor(private readonly repository: CustomersRepository) {}

  async findAll(params: {
    search?: string;
    includeDeleted?: boolean;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    return this.repository.findAll(params);
  }

  async findOne(id: string, includeDeleted = false) {
    const customer = await this.repository.findById(id, includeDeleted);
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  async create(dto: CreateCustomerDto) {
    return this.repository.create({
      name: dto.name,
      phone: dto.phone,
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    return this.repository.update(id, data);
  }

  async softDelete(id: string) {
    await this.findOne(id);
    return this.repository.softDelete(id);
  }

  async getHistory(id: string) {
    await this.findOne(id);
    return this.repository.getCustomerSales(id);
  }
}
