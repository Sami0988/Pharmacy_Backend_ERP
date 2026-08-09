import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: MinioClient;
  private readonly buckets = ['invoices', 'batch-qr-codes', 'receipts', 'reports', 'profile-images'];

  constructor(private readonly configService: ConfigService) {
    this.client = new MinioClient({
      endPoint: configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: configService.get<number>('MINIO_PORT', 9000),
      useSSL: configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: configService.get<string>('MINIO_ACCESS_KEY', ''),
      secretKey: configService.get<string>('MINIO_SECRET_KEY', ''),
    });
  }

  async onModuleInit() {
    await this.ensureBuckets();
  }

  async ensureBuckets() {
    for (const bucket of this.buckets) {
      try {
        const exists = await this.client.bucketExists(bucket);
        if (!exists) {
          await this.client.makeBucket(bucket);
          this.logger.log(`Created bucket: ${bucket}`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to ensure bucket ${bucket}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async uploadFile(
    bucket: string,
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.client.putObject(bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    return key;
  }

  async getSignedUrl(
    bucket: string,
    key: string,
    expirySeconds = 3600,
  ): Promise<string> {
    return this.client.presignedGetObject(bucket, key, expirySeconds);
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    await this.client.removeObject(bucket, key);
  }

  async checkConnection(): Promise<void> {
    // List buckets to verify connectivity — throws if MinIO is unreachable
    await this.client.listBuckets();
  }
}
