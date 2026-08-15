import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { SuppliersRepository } from './suppliers.repository';
import { CacheService } from '../../common/cache/cache.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PaginatedResponse } from '../../common/pagination';
import { DatabaseService } from '../../db/database.service';
import { goodsReceipts, supplierPayments } from '../../db';

@Injectable()
export class SuppliersService {
  private readonly cachePrefix = 'suppliers';

  constructor(
    private readonly suppliersRepository: SuppliersRepository,
    private readonly cache: CacheService,
    private readonly databaseService: DatabaseService,
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
    const data = {
      ...createSupplierDto,
      licenseNo: createSupplierDto.licenseNo ?? createSupplierDto.licenseNumber,
    };
    delete (data as any).licenseNumber;
    const result = await this.suppliersRepository.create(data);
    await this.invalidateListCache();
    return result;
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto) {
    await this.findOne(id);
    const data = {
      ...updateSupplierDto,
      licenseNo: updateSupplierDto.licenseNo ?? updateSupplierDto.licenseNumber,
    };
    delete (data as any).licenseNumber;
    const result = await this.suppliersRepository.update(id, data);
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

  async hardDelete(id: string) {
    await this.findOne(id);

    const db = this.databaseService.db;

    const [grnCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(goodsReceipts)
      .where(eq(goodsReceipts.supplierId, id));

    const [paymentCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(supplierPayments)
      .where(eq(supplierPayments.supplierId, id));

    const dependencies: string[] = [];
    if (grnCount.count > 0) dependencies.push(`${grnCount.count} GRN(s)`);
    if (paymentCount.count > 0) dependencies.push(`${paymentCount.count} payment(s)`);

    if (dependencies.length > 0) {
      throw new BadRequestException(
        `Cannot delete this supplier. It has ${dependencies.join(' and ')}. Delete them first.`,
      );
    }

    const result = await this.suppliersRepository.hardDelete(id);
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
