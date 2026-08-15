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
    const publicId = key.replace(/\.[^/.]+$/, '');
    const shouldUseFolder = !publicId.startsWith(`${bucket}/`);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          ...(shouldUseFolder ? { folder: bucket } : {}),
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
            resolve(result?.secure_url || result?.public_id || key);
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
    if (!key) return '';
    if (key.startsWith('http')) return key;
    try {
      // Strip file extension (e.g. .jpg, .pdf) from the key
      const keyWithoutExt = key.replace(/\.[^/.]+$/, '');
      // Old records: key is "invoices/supplierId/GRN-xxx" but file is at "invoices/invoices/supplierId/GRN-xxx"
      const publicId = keyWithoutExt.startsWith(`${bucket}/`)
        ? `${bucket}/${keyWithoutExt}`
        : keyWithoutExt;
      const url = cloudinary.url(publicId, {
        type: 'upload',
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
      let publicId: string;
      if (key.startsWith('http')) {
        // Extract public_id from Cloudinary URL: .../upload/<version>/<public_id>.<format>
        const match = key.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?(?:\?|$)/);
        publicId = match ? match[1] : key;
      } else {
        publicId = key.startsWith(`${bucket}/`) ? key : `${bucket}/${key}`;
      }
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
