import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  async generatePdf(
    html: string,
    options?: { format?: 'A4' | 'A5' | 'Letter'; landscape?: boolean },
  ): Promise<Buffer> {
    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        format: options?.format ?? 'A4',
        landscape: options?.landscape ?? false,
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      if (browser) await browser.close();
    }
  }

  buildHtmlFromRows(
    title: string,
    headers: string[],
    rows: string[][],
  ): string {
    const headerCells = headers.map((h) => `<th style="padding:8px;border-bottom:2px solid #333;text-align:left">${h}</th>`).join('');
    const bodyRows = rows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td style="padding:6px;border-bottom:1px solid #ddd">${cell}</td>`).join('')}</tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #333; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f5f5f5; }
  td, th { text-align: left; }
</style></head><body>
<h1>${title}</h1>
<div class="subtitle">Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
</body></html>`;
  }
}
