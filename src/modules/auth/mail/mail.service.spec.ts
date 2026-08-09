import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(async () => ({ messageId: 'test-id' })),
  })),
}));

describe('MailService', () => {
  let service: MailService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const env: Record<string, any> = {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          SMTP_USER: 'user',
          SMTP_PASSWORD: 'pass',
          SMTP_FROM: 'Pharmacy ERP <no-reply@test.com>',
          FRONTEND_URL: 'http://localhost:3000',
        };
        return env[key] ?? defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  describe('sendPasswordResetEmail', () => {
    it('should send an email with reset link', async () => {
      await expect(
        service.sendPasswordResetEmail('user@test.com', 'reset-token-123'),
      ).resolves.not.toThrow();
    });
  });

  describe('sendPasswordChangeConfirmation', () => {
    it('should send confirmation email', async () => {
      await expect(
        service.sendPasswordChangeConfirmation('user@test.com'),
      ).resolves.not.toThrow();
    });
  });
});
