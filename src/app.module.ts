import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './db/database.module';
import { StorageModule } from './common/storage/storage.module';
import { CacheModule } from './common/cache/cache.module';
import { AuthModule } from './modules/auth/auth.module';
import { ItemsModule } from './modules/items/items.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { UsersModule } from './modules/users/users.module';
import { GoodsReceiptsModule } from './modules/goods-receipts/goods-receipts.module';
import { BatchesModule } from './modules/batches/batches.module';
import { StockMovementsModule } from './modules/stock-movements/stock-movements.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { SalesModule } from './modules/sales/sales.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SupplierPaymentsModule } from './modules/supplier-payments/supplier-payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ExportModule } from './common/export/export.module';
import { ExportJobModule } from './common/export/export-job.module';
import { HealthModule } from './modules/health/health.module';
import { TraceabilityModule } from './modules/traceability/traceability.module';
import { SearchModule } from './modules/search/search.module';
import { PdfModule } from './common/pdf/pdf.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MfaGuard } from './common/guards/mfa.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: configService.get('LOG_LEVEL', isProduction ? 'info' : 'debug'),
            transport: isProduction ? undefined : { target: 'pino-pretty' },
            genReqId: (req) => req.id || crypto.randomUUID(),
            customSuccessMessage: (req, res) => {
              return `request completed`;
            },
            customLogLevel: (_req, res, err) => {
              if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
              if (res.statusCode >= 500 || err) return 'error';
              return 'info';
            },
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => [
        {
          ttl: 60000,
          limit: 250,
        },
      ],
    }),
    DatabaseModule,
    StorageModule,
    CacheModule,
    AuthModule,
    ItemsModule,
    SuppliersModule,
    UsersModule,
    GoodsReceiptsModule,
    BatchesModule,
    StockMovementsModule,
    TransfersModule,
    SalesModule,
    CustomersModule,
    SupplierPaymentsModule,
    NotificationsModule,
    JobsModule,
    ReportsModule,
    DashboardModule,
    ExportModule,
    ExportJobModule,
    HealthModule,
    TraceabilityModule,
    SearchModule,
    PdfModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MfaGuard,
    },
  ],
})
export class AppModule {}
