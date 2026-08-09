import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { items, suppliers, customers, batches } from '../../db';
import { or, ilike, isNull, sql, desc, and } from 'drizzle-orm';

export interface SearchResult {
  type: 'item' | 'supplier' | 'customer' | 'batch';
  id: string;
  title: string;
  subtitle: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SearchService {
  constructor(private readonly databaseService: DatabaseService) {}

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = `%${query}%`;

    const [itemResults, supplierResults, customerResults, batchResults] =
      await Promise.all([
        this.searchItems(searchTerm, limit),
        this.searchSuppliers(searchTerm, limit),
        this.searchCustomers(searchTerm, limit),
        this.searchBatches(searchTerm, limit),
      ]);

    return [
      ...itemResults,
      ...supplierResults,
      ...customerResults,
      ...batchResults,
    ].slice(0, limit * 2); // Return up to 2x limit for mixed results
  }

  private async searchItems(
    searchTerm: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.databaseService.db
      .select({
        id: items.id,
        name: items.name,
        genericName: items.genericName,
        category: items.category,
      })
      .from(items)
      .where(
        and(
          isNull(items.deletedAt),
          or(
            ilike(items.name, searchTerm),
            ilike(items.genericName, searchTerm),
            ilike(items.category, searchTerm),
          ),
        ),
      )
      .orderBy(desc(items.createdAt))
      .limit(limit);

    return results.map((item) => ({
      type: 'item' as const,
      id: item.id,
      title: item.name,
      subtitle: [item.genericName, item.category].filter(Boolean).join(' - '),
      metadata: {},
    }));
  }

  private async searchSuppliers(
    searchTerm: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.databaseService.db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        phone: suppliers.phone,
        licenseNo: suppliers.licenseNo,
      })
      .from(suppliers)
      .where(
        and(
          isNull(suppliers.deletedAt),
          or(
            ilike(suppliers.name, searchTerm),
            ilike(suppliers.phone, searchTerm),
            ilike(suppliers.licenseNo, searchTerm),
          ),
        ),
      )
      .orderBy(desc(suppliers.createdAt))
      .limit(limit);

    return results.map((supplier) => ({
      type: 'supplier' as const,
      id: supplier.id,
      title: supplier.name,
      subtitle: supplier.phone,
      metadata: {
        licenseNo: supplier.licenseNo,
      },
    }));
  }

  private async searchCustomers(
    searchTerm: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.databaseService.db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        creditBalance: customers.creditBalance,
      })
      .from(customers)
      .where(
        and(
          isNull(customers.deletedAt),
          or(
            ilike(customers.name, searchTerm),
            ilike(customers.phone, searchTerm),
          ),
        ),
      )
      .orderBy(desc(customers.createdAt))
      .limit(limit);

    return results.map((customer) => ({
      type: 'customer' as const,
      id: customer.id,
      title: customer.name,
      subtitle: customer.phone || 'No phone',
      metadata: {
        creditBalance: customer.creditBalance,
      },
    }));
  }

  private async searchBatches(
    searchTerm: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.databaseService.db
      .select({
        id: batches.id,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        quantityReceived: batches.quantityReceived,
        itemName: items.name,
      })
      .from(batches)
      .innerJoin(items, sql`${batches.itemId} = ${items.id}`)
      .where(
        and(
          isNull(items.deletedAt),
          or(
            ilike(batches.batchNo, searchTerm),
            ilike(items.name, searchTerm),
          ),
        ),
      )
      .orderBy(desc(batches.createdAt))
      .limit(limit);

    return results.map((batch) => ({
      type: 'batch' as const,
      id: batch.id,
      title: batch.batchNo,
      subtitle: `${batch.itemName} - Expires: ${batch.expiryDate}`,
      metadata: {
        expiryDate: batch.expiryDate,
        quantityReceived: batch.quantityReceived,
      },
    }));
  }
}
