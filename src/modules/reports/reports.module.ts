import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsRepository } from './reports.repository';
import { SupplierPaymentsModule } from '../supplier-payments/supplier-payments.module';
import { ExportModule } from '../../common/export/export.module';
import { DatabaseModule } from '../../db/database.module';

@Module({
  imports: [SupplierPaymentsModule, ExportModule, DatabaseModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
  exports: [ReportsService],
})
export class ReportsModule {}
