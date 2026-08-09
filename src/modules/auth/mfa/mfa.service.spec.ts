import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MfaService } from './mfa.service';

jest.mock('bcrypt', () => ({
  default: {
    hash: jest.fn(async (s: string) => `hashed_${s}`),
    compare: jest.fn(async (s: string, h: string) => h === `hashed_${s}`),
  },
  hash: jest.fn(async (s: string) => `hashed_${s}`),
  compare: jest.fn(async (s: string, h: string) => h === `hashed_${s}`),
}));

describe('MfaService', () => {
  let service: MfaService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const env: Record<string, string> = {
          MFA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
          MFA_APP_NAME: 'TestApp',
        };
        return env[key] ?? defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MfaService>(MfaService);
  });

  describe('generateSecret', () => {
    it('should generate a TOTP secret with otpauth URL', () => {
      const result = service.generateSecret('user@test.com');
      expect(result.base32).toBeDefined();
      expect(result.otpauth_url).toBeDefined();
      expect(result.otpauth_url).toContain('TestApp');
      expect(result.otpauth_url).toContain('user%40test.com');
    });
  });

  describe('encryptSecret / decryptSecret', () => {
    it('should encrypt and decrypt a secret round-trip', () => {
      const original = 'JBSWY3DPEHPK3PXP';
      const encrypted = service.encryptSecret(original);
      expect(encrypted).not.toBe(original);
      expect(encrypted).toContain(':');
      const decrypted = service.decryptSecret(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertext for same input (random IV)', () => {
      const enc1 = service.encryptSecret('test');
      const enc2 = service.encryptSecret('test');
      expect(enc1).not.toBe(enc2);
    });
  });

  describe('verifyTotp', () => {
    it('should return a boolean', () => {
      const result = service.verifyTotp('JBSWY3DPEHPK3PXP', '123456');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate default 10 codes', () => {
      const codes = service.generateBackupCodes();
      expect(codes).toHaveLength(10);
      codes.forEach((code) => {
        expect(code).toMatch(/^[0-9A-F]{8}$/);
      });
    });

    it('should generate custom count', () => {
      const codes = service.generateBackupCodes(5);
      expect(codes).toHaveLength(5);
    });
  });

  describe('hashBackupCodes', () => {
    it('should hash all codes', async () => {
      const codes = ['ABCD1234', 'EFGH5678'];
      const hashed = await service.hashBackupCodes(codes);
      expect(hashed).toHaveLength(2);
      hashed.forEach((h) => {
        expect(h).toMatch(/^hashed_/);
      });
    });
  });

  describe('verifyBackupCode', () => {
    it('should find matching backup code', async () => {
      const hashed = await service.hashBackupCodes(['ABCD1234']);
      const result = await service.verifyBackupCode(hashed, 'ABCD1234');
      expect(result.valid).toBe(true);
      expect(result.index).toBe(0);
    });

    it('should return invalid for non-matching code', async () => {
      const hashed = await service.hashBackupCodes(['ABCD1234']);
      const result = await service.verifyBackupCode(hashed, 'WRONG123');
      expect(result.valid).toBe(false);
      expect(result.index).toBe(-1);
    });
  });
});
