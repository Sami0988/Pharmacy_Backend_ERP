import { Injectable, NotFoundException } from '@nestjs/common';
import { ItemsRepository } from './items.repository';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { CacheService } from '../../common/cache/cache.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { PaginatedResponse } from '../../common/pagination';

@Injectable()
export class ItemsService {
  private readonly cachePrefix = 'items';

  constructor(
    private readonly itemsRepository: ItemsRepository,
    private readonly stockMovementsService: StockMovementsService,
    private readonly cache: CacheService,
  ) {}

  async findAll(params: {
    search?: string;
    category?: string;
    includeDeleted?: boolean;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const cacheKey = `${this.cachePrefix}:list:${params.search || ''}:${params.category || ''}:${params.includeDeleted}:${params.page}:${params.limit}:${params.sortBy || ''}:${params.sortOrder || ''}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const result = await this.itemsRepository.findAll(params);
    await this.cache.set(cacheKey, result, 600);
    return result;
  }

  async findOne(id: string, includeDeleted = false) {
    const cacheKey = `${this.cachePrefix}:${id}:${includeDeleted}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const item = await this.itemsRepository.findById(id, includeDeleted);
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    await this.cache.set(cacheKey, item, 600);
    return item;
  }

  async create(createItemDto: CreateItemDto) {
    const result = await this.itemsRepository.create(createItemDto);
    await this.invalidateListCache();
    return result;
  }

  async update(id: string, updateItemDto: UpdateItemDto) {
    await this.findOne(id);
    const result = await this.itemsRepository.update(id, updateItemDto);
    await this.cache.del(`${this.cachePrefix}:${id}`);
    await this.invalidateListCache();
    return result;
  }

  async softDelete(id: string) {
    await this.findOne(id);
    const result = await this.itemsRepository.softDelete(id);
    await this.cache.del(`${this.cachePrefix}:${id}`);
    await this.invalidateListCache();
    return result;
  }

  async findSubstitutes(itemId: string, dispatcherLocationId: string) {
    const item = await this.findOne(itemId);
    if (!item.genericName) return [];

    const substitutes = await this.itemsRepository.findSubstitutes(
      itemId,
      item.genericName,
    );

    const results: Array<{ id: string; name: string; genericName: string | null; strength: string | null; unit: string; availableQuantity: number }> = [];
    for (const sub of substitutes) {
      const qty = await this.stockMovementsService.getCurrentQuantity(
        sub.id,
        dispatcherLocationId,
      );
      if (qty > 0) {
        results.push({ ...sub, availableQuantity: qty });
      }
    }
    return results;
  }

  private async invalidateListCache() {
    await this.cache.delPattern(`${this.cachePrefix}:list:*`);
  }
}
