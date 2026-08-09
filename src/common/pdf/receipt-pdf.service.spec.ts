import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptPdfService } from './receipt-pdf.service';
import { MinioService } from '../storage/minio.service';

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf-content')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('<html>{{storeName}}</html>'),
}));

describe('ReceiptPdfService', () => {
  let service: ReceiptPdfService;
  let minioService: jest.Mocked<MinioService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    minioService = {
      uploadFile: jest.fn().mockResolvedValue('receipts/sale-1.pdf'),
      getSignedUrl: jest.fn().mockResolvedValue('https://minio/receipt.pdf'),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptPdfService,
        { provide: MinioService, useValue: minioService },
      ],
    }).compile();

    service = module.get<ReceiptPdfService>(ReceiptPdfService);
  });

  describe('generateReceipt', () => {
    const mockSale = {
      id: 'sale-1',
      branchName: 'Main Branch',
      soldByName: 'Cashier Joe',
      paymentMethod: 'cash',
      totalAmount: '10000',
      createdAt: new Date().toISOString(),
      items: [
        {
          itemName: 'Paracetamol 500mg',
          batchNo: 'BATCH-001',
          quantity: 2,
          unitPrice: '5000',
        },
      ],
    };

    it('should generate PDF and upload to MinIO', async () => {
      const result = await service.generateReceipt(mockSale);
      expect(result).toBe('receipts/sale-1.pdf');
      expect(minioService.uploadFile).toHaveBeenCalledWith(
        'receipts',
        'receipts/sale-1.pdf',
        expect.any(Buffer),
        'application/pdf',
      );
    });

    it('should generate with customer name when present', async () => {
      const saleWithCustomer = {
        ...mockSale,
        customerName: 'John Doe',
      };
      const result = await service.generateReceipt(saleWithCustomer);
      expect(result).toBe('receipts/sale-1.pdf');
    });
  });

  describe('getSignedUrl', () => {
    it('should return signed URL from MinIO', async () => {
      const result = await service.getSignedUrl('receipts/sale-1.pdf');
      expect(result).toBe('https://minio/receipt.pdf');
      expect(minioService.getSignedUrl).toHaveBeenCalledWith(
        'receipts',
        'receipts/sale-1.pdf',
      );
    });
  });
});
