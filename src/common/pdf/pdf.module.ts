import { Module } from '@nestjs/common';
import { PdfController } from './pdf.controller';
import { PdfKitService } from './pdfkit.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [PdfController],
  providers: [PdfKitService, ReceiptPdfService],
  exports: [PdfKitService, ReceiptPdfService],
})
export class PdfModule {}
