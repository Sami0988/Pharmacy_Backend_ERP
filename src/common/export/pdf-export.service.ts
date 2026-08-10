import { Injectable, Logger } from '@nestjs/common';
import { PdfKitService } from '../pdf/pdfkit.service';

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  constructor(private readonly pdfService: PdfKitService) {}

  async generatePdfFromData(
    title: string,
    headers: string[],
    rows: string[][],
  ): Promise<Buffer> {
    return this.pdfService.generateTable({ title, headers, rows });
  }
}
