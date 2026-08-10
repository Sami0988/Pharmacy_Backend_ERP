import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExportJobController } from './export-job.controller';
import { ExportJobService } from './export-job.service';
import { ExportJobProcessor } from './export-job.processor';
import { PdfExportService } from './pdf-export.service';
import { ReportsRepository } from '../../modules/reports/reports.repository';
import { StorageModule } from '../../common/storage/storage.module';
import { DatabaseModule } from '../../db/database.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'export-jobs' }),
    StorageModule,
    DatabaseModule,
    PdfModule,
  ],
  controllers: [ExportJobController],
  providers: [ExportJobService, ExportJobProcessor, PdfExportService, ReportsRepository],
  exports: [ExportJobService],
})
export class ExportJobModule {}
