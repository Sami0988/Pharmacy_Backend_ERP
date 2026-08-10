import { Injectable, Logger } from '@nestjs/common';
import { PdfKitService } from './pdfkit.service';
import { MinioService } from '../storage/minio.service';

@Injectable()
export class ReceiptPdfService {
  private readonly logger = new Logger(ReceiptPdfService.name);

  constructor(
    private readonly pdfService: PdfKitService,
    private readonly minioService: MinioService,
  ) {}

  async generateReceipt(sale: any): Promise<string> {
    const items = (sale.items ?? []).map((item: any) => ({
      itemName: item.itemName,
      batchNo: item.batchNo,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.unitPrice) * Number(item.quantity),
    }));

    const paymentLabels: Record<string, string> = {
      cash: 'Cash',
      mobile_money: 'Mobile Money',
      card: 'Card',
      credit: 'Credit',
    };

    const saleDate = sale.createdAt
      ? new Date(sale.createdAt).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('en-GB');

    const pdfBuffer = await this.pdfService.generateReceipt({
      storeName: sale.branchName ?? 'Pharmacy',
      saleDate,
      receiptNumber: sale.id.slice(0, 8).toUpperCase(),
      cashierName: sale.soldByName ?? 'Cashier',
      paymentMethod: paymentLabels[sale.paymentMethod] ?? sale.paymentMethod,
      items,
      totalAmount: Number(sale.totalAmount),
      customerName: sale.customerName,
    });

    const key = `receipts/${sale.id}.pdf`;
    await this.minioService.uploadFile('receipts', key, pdfBuffer, 'application/pdf');
    return key;
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.minioService.getSignedUrl('receipts', key);
  }
}
