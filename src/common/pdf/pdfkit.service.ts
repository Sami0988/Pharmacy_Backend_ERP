import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface ReceiptData {
  storeName: string;
  saleDate: string;
  receiptNumber: string;
  cashierName: string;
  paymentMethod: string;
  items: Array<{
    itemName: string;
    batchNo: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  totalAmount: number;
  customerName?: string;
}

export interface TableData {
  title: string;
  headers: string[];
  rows: string[][];
}

@Injectable()
export class PdfKitService {
  private readonly logger = new Logger(PdfKitService.name);

  generateReceipt(data: ReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A5',
          margin: 30,
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(16).font('Helvetica-Bold').text(data.storeName, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(8).font('Helvetica').text(`Date: ${data.saleDate}`, { align: 'center' });
        doc.text(`Receipt: ${data.receiptNumber}`, { align: 'center' });
        doc.text(`Cashier: ${data.cashierName}`, { align: 'center' });
        doc.text(`Payment: ${data.paymentMethod}`, { align: 'center' });
        if (data.customerName) {
          doc.text(`Customer: ${data.customerName}`, { align: 'center' });
        }

        doc.moveDown(0.5);
        doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).stroke();
        doc.moveDown(0.3);

        // Table header
        const tableTop = doc.y;
        const colWidths = [180, 40, 60, 70];
        const colX = [30, 210, 250, 310];

        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Item', colX[0], tableTop, { width: colWidths[0] });
        doc.text('Qty', colX[1], tableTop, { width: colWidths[1], align: 'right' });
        doc.text('Price', colX[2], tableTop, { width: colWidths[2], align: 'right' });
        doc.text('Total', colX[3], tableTop, { width: colWidths[3], align: 'right' });

        doc.moveDown(0.3);
        doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).stroke();
        doc.moveDown(0.3);

        // Table rows
        doc.font('Helvetica').fontSize(8);
        for (const item of data.items) {
          const y = doc.y;
          doc.text(item.itemName, colX[0], y, { width: colWidths[0] });
          doc.text(String(item.quantity), colX[1], y, { width: colWidths[1], align: 'right' });
          doc.text(Number(item.unitPrice).toFixed(2), colX[2], y, { width: colWidths[2], align: 'right' });
          doc.text(Number(item.lineTotal).toFixed(2), colX[3], y, { width: colWidths[3], align: 'right' });
          doc.moveDown(0.3);
        }

        doc.moveDown(0.3);
        doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).stroke();
        doc.moveDown(0.3);

        // Total
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text(`Total: ${Number(data.totalAmount).toFixed(2)}`, { align: 'right' });

        doc.moveDown(1);
        doc.fontSize(8).font('Helvetica').text('Thank you for your purchase!', { align: 'center' });

        doc.end();
      } catch (error) {
        this.logger.error('Failed to generate receipt PDF', error);
        reject(error);
      }
    });
  }

  generateTable(data: TableData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Title
        doc.fontSize(16).font('Helvetica-Bold').text(data.title, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(8).font('Helvetica').text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, { align: 'center' });
        doc.moveDown(1);

        // Calculate column widths
        const pageWidth = doc.page.width - 80;
        const colCount = data.headers.length;
        const colWidth = pageWidth / colCount;

        // Table header
        const tableTop = doc.y;
        doc.fontSize(8).font('Helvetica-Bold');
        data.headers.forEach((header, i) => {
          doc.text(header, 40 + i * colWidth, tableTop, { width: colWidth });
        });

        doc.moveDown(0.5);
        doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
        doc.moveDown(0.3);

        // Table rows
        doc.font('Helvetica').fontSize(8);
        for (const row of data.rows) {
          const y = doc.y;
          row.forEach((cell, i) => {
            doc.text(cell, 40 + i * colWidth, y, { width: colWidth });
          });
          doc.moveDown(0.3);

          // Check if we need a new page
          if (doc.y > doc.page.height - 60) {
            doc.addPage();
          }
        }

        doc.end();
      } catch (error) {
        this.logger.error('Failed to generate table PDF', error);
        reject(error);
      }
    });
  }
}
