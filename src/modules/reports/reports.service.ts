import { Injectable, BadRequestException } from '@nestjs/common';
import { ReportsRepository } from './reports.repository';
import { SupplierPaymentsService } from '../supplier-payments/supplier-payments.service';
import { PaginatedResponse } from '../../common/pagination';

@Injectable()
export class ReportsService {
  constructor(
    private readonly repository: ReportsRepository,
    private readonly supplierPaymentsService: SupplierPaymentsService,
  ) {}

  async getStockReport(params: { page: number; limit: number }, format?: string): Promise<PaginatedResponse<any> | any> {
    const result = await this.repository.getStockReport(params);
    if (format === 'csv') return { data: result.data, columns: [
      { key: 'itemName', header: 'Item' },
      { key: 'storeQuantity', header: 'Store Qty' },
      { key: 'dispatcherQuantity', header: 'Dispatcher Qty' },
      { key: 'totalQuantity', header: 'Total Qty' },
      { key: 'totalValueAtCost', header: 'Value at Cost' },
    ]};
    return result;
  }

  async getExpiryReport(withinDays?: number, format?: string, pagination?: { page: number; limit: number }) {
    const days = withinDays && withinDays > 0 ? withinDays : 90;
    const result = await this.repository.getExpiryReport(days, pagination);
    if (format === 'csv') return { data: result.data, columns: [
      { key: 'itemName', header: 'Item' },
      { key: 'batchNo', header: 'Batch No' },
      { key: 'expiryDate', header: 'Expiry Date' },
      { key: 'locationName', header: 'Location' },
      { key: 'quantity', header: 'Quantity' },
      { key: 'unitCost', header: 'Unit Cost' },
      { key: 'isExpired', header: 'Expired' },
    ]};
    return result;
  }

  async getSalesReport(startDate?: string, endDate?: string, format?: string, pagination?: { page: number; limit: number }) {
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }
    const result = await this.repository.getSalesReport(startDate, endDate, pagination);

    if (format === 'csv') {
      const flatRows = result.data.map((row: any) => ({
        saleId: row.saleId,
        saleDate: row.saleDate,
        itemName: row.itemName,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
        totalAmount: row.totalAmount,
        paymentMethod: row.paymentMethod,
        soldByName: row.soldByName,
      }));
      return { data: flatRows, columns: [
        { key: 'saleId', header: 'Sale ID' },
        { key: 'saleDate', header: 'Date' },
        { key: 'itemName', header: 'Item' },
        { key: 'quantity', header: 'Qty' },
        { key: 'unitPrice', header: 'Unit Price' },
        { key: 'lineTotal', header: 'Line Total' },
        { key: 'totalAmount', header: 'Sale Total' },
        { key: 'paymentMethod', header: 'Payment' },
        { key: 'soldByName', header: 'Cashier' },
      ]};
    }

    if (pagination) {
      const summary = await this.repository.getSalesSummary(startDate, endDate);
      return { ...result, summary };
    }

    return result;
  }

  async getSupplierBalanceReport(format?: string) {
    const data = await this.repository.getSupplierBalanceReport();
    if (format === 'csv') return { data, columns: [
      { key: 'supplierName', header: 'Supplier' },
      { key: 'totalCost', header: 'Total Cost' },
      { key: 'totalPaid', header: 'Total Paid' },
      { key: 'outstanding', header: 'Outstanding' },
    ]};
    return data;
  }

  async getDeadStockReport(daysThreshold?: number, format?: string, pagination?: { page: number; limit: number }) {
    const days = daysThreshold && daysThreshold > 0 ? daysThreshold : 60;

    const result = await this.repository.getDeadStockReport(days, pagination);

    if (format === 'csv') return { data: result.data, columns: [
      { key: 'itemName', header: 'Item' },
      { key: 'totalQuantityOnHand', header: 'Quantity on Hand' },
      { key: 'tiedUpValue', header: 'Tied Up Value' },
      { key: 'daysSinceLastSale', header: 'Days Since Last Sale' },
    ]};
    return result;
  }
}
