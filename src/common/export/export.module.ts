import { Module } from '@nestjs/common';
import { PdfExportService } from './pdf-export.service';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [PdfModule],
  providers: [PdfExportService],
  exports: [PdfExportService],
})
export class ExportModule {}
