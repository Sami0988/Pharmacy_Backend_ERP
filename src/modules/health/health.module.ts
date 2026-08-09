import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseService } from '../../db/database.service';
import { MinioService } from '../../common/storage/minio.service';
import { CacheService } from '../../common/cache/cache.service';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseService, MinioService, CacheService, ConfigService],
})
export class HealthModule {}
