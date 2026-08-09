import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { MinioService } from '../storage/minio.service';

@Injectable()
export class ReceiptPdfService {
  private readonly logger = new Logger(ReceiptPdfService.name);
  private readonly templateHtml: string;

  constructor(private readonly minioService: MinioService) {
    const templatePath = path.join(process.cwd(), 'src', 'common', 'pdf', 'receipt-template.html');
    this.templateHtml = fs.readFileSync(templatePath, 'utf-8');
  }

  async generateReceipt(sale: any): Promise<string> {
    const html = this.renderTemplate(sale);

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });

      const pdfBuffer = await page.pdf({
        format: 'A5',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });

      const key = `receipts/${sale.id}.pdf`;
      await this.minioService.uploadFile('receipts', key, Buffer.from(pdfBuffer), 'application/pdf');
      return key;
    } finally {
      if (browser) await browser.close();
    }
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.minioService.getSignedUrl('receipts', key);
  }

  private renderTemplate(sale: any): string {
    const items = (sale.items ?? []).map((item: any) => ({
      ...item,
      unitPrice: Number(item.unitPrice).toFixed(2),
      lineTotal: (Number(item.unitPrice) * Number(item.quantity)).toFixed(2),
    }));

    const totalAmount = Number(sale.totalAmount).toFixed(2);

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

    let html = this.templateHtml;

    html = html.replace('{{storeName}}', sale.branchName ?? 'Pharmacy');
    html = html.replace('{{saleDate}}', saleDate);
    html = html.replace('{{receiptNumber}}', sale.id.slice(0, 8).toUpperCase());
    html = html.replace('{{cashierName}}', sale.soldByName ?? 'Cashier');
    html = html.replace('{{paymentMethod}}', paymentLabels[sale.paymentMethod] ?? sale.paymentMethod);
    html = html.replace('{{totalAmount}}', totalAmount);

    if (sale.customerName) {
      html = html.replace('{{customerName}}', sale.customerName);
    } else {
      html = html.replace('{{customerName}}', '');
    }

    const itemRows = items
      .map(
        (item: any) => `
      <tr>
        <td>${item.itemName}<br><small>Batch: ${item.batchNo}</small></td>
        <td class="col-qty">${item.quantity}</td>
        <td class="col-price">${item.unitPrice}</td>
        <td class="col-total">${item.lineTotal}</td>
      </tr>`,
      )
      .join('');

    html = html.replace(
      /{{#each items}}[\s\S]*?{{\/each}}/,
      itemRows,
    );

    return html;
  }
}
