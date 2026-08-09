import { Injectable, NotFoundException } from '@nestjs/common';
import { SuppliersRepository } from './suppliers.repository';
import { CacheService } from '../../common/cache/cache.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PaginatedResponse } from '../../common/pagination';

@Injectable()
export class SuppliersService {
  private readonly cachePrefix = 'suppliers';

  constructor(
    private readonly suppliersRepository: SuppliersRepository,
    private readonly cache: CacheService,
  ) {}

  async findAll(params: {
    search?: string;
    includeDeleted?: boolean;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const cacheKey = `${this.cachePrefix}:list:${params.search || ''}:${params.includeDeleted}:${params.page}:${params.limit}:${params.sortBy || ''}:${params.sortOrder || ''}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const result = await this.suppliersRepository.findAll(params);
    await this.cache.set(cacheKey, result, 600);
    return result;
  }

  async findOne(id: string, includeDeleted = false) {
    const cacheKey = `${this.cachePrefix}:${id}:${includeDeleted}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const supplier = await this.suppliersRepository.findById(id, includeDeleted);
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    await this.cache.set(cacheKey, supplier, 600);
    return supplier;
  }

  async create(createSupplierDto: CreateSupplierDto) {
    const result = await this.suppliersRepository.create(createSupplierDto);
    await this.invalidateListCache();
    return result;
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto) {
    await this.findOne(id);
    const result = await this.suppliersRepository.update(id, updateSupplierDto);
    await this.cache.del(`${this.cachePrefix}:${id}`);
    await this.invalidateListCache();
    return result;
  }

  async softDelete(id: string) {
    await this.findOne(id);
    const result = await this.suppliersRepository.softDelete(id);
    await this.cache.del(`${this.cachePrefix}:${id}`);
    await this.invalidateListCache();
    return result;
  }

  async getBalances() {
    return this.suppliersRepository.getBalances();
  }

  private async invalidateListCache() {
    await this.cache.delPattern(`${this.cachePrefix}:list:*`);
  }
}
