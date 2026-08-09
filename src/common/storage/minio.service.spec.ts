import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MinioService } from './minio.service';

const mockMinioClient = {
  bucketExists: jest.fn(),
  makeBucket: jest.fn(),
  putObject: jest.fn(),
  presignedGetObject: jest.fn(),
  removeObject: jest.fn(),
};

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => mockMinioClient),
}));

describe('MinioService', () => {
  let service: MinioService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMinioClient.bucketExists.mockResolvedValue(false);
    mockMinioClient.makeBucket.mockResolvedValue(undefined);
    mockMinioClient.putObject.mockResolvedValue(undefined);
    mockMinioClient.presignedGetObject.mockResolvedValue('http://signed-url');
    mockMinioClient.removeObject.mockResolvedValue(undefined);

    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const env: Record<string, any> = {
          MINIO_ENDPOINT: 'localhost',
          MINIO_PORT: 9000,
          MINIO_USE_SSL: 'false',
          MINIO_ACCESS_KEY: 'access',
          MINIO_SECRET_KEY: 'secret',
        };
        return env[key] ?? defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MinioService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MinioService>(MinioService);
  });

  describe('ensureBuckets', () => {
    it('should create buckets if they do not exist', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);
      await service.ensureBuckets();
      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith('invoices');
      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith('batch-qr-codes');
    });

    it('should not create buckets if they already exist', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);
      await service.ensureBuckets();
      expect(mockMinioClient.makeBucket).not.toHaveBeenCalled();
    });
  });

  describe('uploadFile', () => {
    it('should upload file and return key', async () => {
      const buffer = Buffer.from('test');
      const result = await service.uploadFile(
        'invoices',
        'test.pdf',
        buffer,
        'application/pdf',
      );
      expect(result).toBe('test.pdf');
      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'invoices',
        'test.pdf',
        buffer,
        buffer.length,
        { 'Content-Type': 'application/pdf' },
      );
    });
  });

  describe('getSignedUrl', () => {
    it('should return signed URL', async () => {
      const result = await service.getSignedUrl('invoices', 'test.pdf');
      expect(result).toBe('http://signed-url');
      expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith(
        'invoices',
        'test.pdf',
        3600,
      );
    });

    it('should use custom expiry', async () => {
      await service.getSignedUrl('invoices', 'test.pdf', 7200);
      expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith(
        'invoices',
        'test.pdf',
        7200,
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file', async () => {
      await service.deleteFile('invoices', 'test.pdf');
      expect(mockMinioClient.removeObject).toHaveBeenCalledWith(
        'invoices',
        'test.pdf',
      );
    });
  });
});
