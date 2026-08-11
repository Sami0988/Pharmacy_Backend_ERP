import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MinioService } from './minio.service';

const mockCloudinary = {
  config: jest.fn(),
  uploader: {
    upload_stream: jest.fn(),
    destroy: jest.fn(),
  },
  url: jest.fn(),
  api: {
    ping: jest.fn(),
  },
};

jest.mock('cloudinary', () => ({
  v2: mockCloudinary,
}));

describe('MinioService', () => {
  let service: MinioService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCloudinary.api.ping.mockResolvedValue({ status: 'ok' });
    mockCloudinary.url.mockReturnValue('https://res.cloudinary.com/test/image/upload/test.pdf');
    mockCloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });
    mockCloudinary.uploader.upload_stream.mockImplementation(
      (opts: any, cb: Function) => {
        const stream = {
          end: jest.fn(() => {
            cb(null, { public_id: opts.public_id, secure_url: 'https://test.pdf' });
          }),
        };
        return stream;
      },
    );

    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const env: Record<string, any> = {
          CLOUDINARY_CLOUD_NAME: 'test',
          CLOUDINARY_API_KEY: 'key',
          CLOUDINARY_API_SECRET: 'secret',
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

  describe('onModuleInit', () => {
    it('should initialize Cloudinary', async () => {
      await service.onModuleInit();
      expect(mockCloudinary.config).toHaveBeenCalledWith({
        cloud_name: 'test',
        api_key: 'key',
        api_secret: 'secret',
      });
    });
  });

  describe('uploadFile', () => {
    it('should upload file and return public id', async () => {
      const buffer = Buffer.from('test');
      const result = await service.uploadFile(
        'invoices',
        'test.pdf',
        buffer,
        'application/pdf',
      );
      expect(result).toBe('test.pdf');
      expect(mockCloudinary.uploader.upload_stream).toHaveBeenCalled();
    });
  });

  describe('getSignedUrl', () => {
    it('should return signed URL', async () => {
      const result = await service.getSignedUrl('invoices', 'test.pdf');
      expect(result).toContain('https://');
      expect(mockCloudinary.url).toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete file', async () => {
      await service.deleteFile('invoices', 'test.pdf');
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith('invoices/test.pdf');
    });
  });

  describe('checkConnection', () => {
    it('should ping Cloudinary', async () => {
      await service.checkConnection();
      expect(mockCloudinary.api.ping).toHaveBeenCalled();
    });

    it('should throw on connection failure', async () => {
      mockCloudinary.api.ping.mockRejectedValue(new Error('Connection failed'));
      await expect(service.checkConnection()).rejects.toThrow('Connection failed');
    });
  });
});
