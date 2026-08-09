import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class MfaService {
  private readonly encryptionKey: Buffer;
  private readonly appName: string;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('MFA_ENCRYPTION_KEY')!;
    this.encryptionKey = Buffer.from(key, 'utf-8').subarray(0, 32);
    this.appName = this.configService.get<string>(
      'MFA_APP_NAME',
      'Pharmacy ERP',
    );
  }

  generateSecret(email: string): speakeasy.GeneratedSecret {
    return speakeasy.generateSecret({
      name: `${this.appName}:${email}`,
      length: 20,
    });
  }

  async generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  }

  verifyTotp(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
    });
  }

  encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  decryptSecret(encryptedSecret: string): string {
    const [ivHex, encrypted] = encryptedSecret.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      this.encryptionKey,
      iv,
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  async hashBackupCodes(codes: string[]): Promise<string[]> {
    const hashed: string[] = [];
    for (const code of codes) {
      hashed.push(await bcrypt.hash(code, 10));
    }
    return hashed;
  }

  async verifyBackupCode(
    hashedCodes: string[],
    inputCode: string,
  ): Promise<{ valid: boolean; index: number }> {
    for (let i = 0; i < hashedCodes.length; i++) {
      const match = await bcrypt.compare(inputCode, hashedCodes[i]);
      if (match) {
        return { valid: true, index: i };
      }
    }
    return { valid: false, index: -1 };
  }
}
