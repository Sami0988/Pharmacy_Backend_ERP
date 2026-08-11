import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async onModuleInit() {
    this.logger.log('Cloudinary storage initialized');
  }

  async uploadFile(
    bucket: string,
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const folder = bucket;
    const publicId = key.replace(/\.[^/.]+$/, '');

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'auto',
          format: contentType.includes('pdf') ? 'pdf' : undefined,
        },
        (error, result) => {
          if (error) {
            this.logger.error(`Upload failed: ${error.message}`);
            reject(error);
          } else {
            this.logger.log(`Uploaded: ${result?.public_id}`);
            resolve(result?.public_id || key);
          }
        },
      );
      uploadStream.end(buffer);
    });
  }

  async getSignedUrl(
    bucket: string,
    key: string,
    expirySeconds = 3600,
  ): Promise<string> {
    try {
      const publicId = key.includes('/') ? key : `${bucket}/${key}`;
      const url = cloudinary.url(publicId, {
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + expirySeconds,
      });
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate signed URL: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    try {
      const publicId = key.includes('/') ? key : `${bucket}/${key}`;
      await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Deleted: ${publicId}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async checkConnection(): Promise<void> {
    try {
      await cloudinary.api.ping();
      this.logger.log('Cloudinary connection OK');
    } catch (error) {
      throw new Error(`Cloudinary connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
