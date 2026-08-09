import { Module } from '@nestjs/common';
import { ReceiptPdfService } from './receipt-pdf.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [ReceiptPdfService],
  exports: [ReceiptPdfService],
})
export class ReceiptPdfModule {}
