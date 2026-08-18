import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseService } from '../../db/database.service';
import { MinioService } from '../../common/storage/minio.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseService, MinioService],
})
export class HealthModule {}
