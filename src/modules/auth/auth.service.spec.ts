import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { MfaService } from './mfa/mfa.service';
import { MailService } from './mail/mail.service';
import { AuditLogUtil } from '../../common/utils/audit-log.util';

describe('AuthService', () => {
  let service: AuthService;
  let authRepository: jest.Mocked<AuthRepository>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let mfaService: jest.Mocked<MfaService>;
  let mailService: jest.Mocked<MailService>;
  let auditLog: jest.Mocked<AuditLogUtil>;

  const mockUser = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ12',
    role: 'admin' as const,
    isActive: true,
    mfaEnabled: false,
    mfaSecretEncrypted: null,
    mfaBackupCodes: null,
    createdAt: new Date(),
  };

  const mockMfaUser = {
    ...mockUser,
    mfaEnabled: true,
    mfaSecretEncrypted: 'iv:encrypted',
    mfaBackupCodes: ['hashed1', 'hashed2'],
  };

  beforeEach(async () => {
    authRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      createRefreshToken: jest.fn(),
      findRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllUserRefreshTokens: jest.fn(),
      updatePassword: jest.fn(),
      createPasswordResetToken: jest.fn(),
      findPasswordResetToken: jest.fn(),
      markPasswordResetTokenUsed: jest.fn(),
      updateBackupCodes: jest.fn(),
      hashToken: jest.fn((t: string) => `hashed_${t}`),
      generateRandomToken: jest.fn(() => 'random-token-123'),
    } as any;

    jwtService = {
      sign: jest.fn(() => 'access-token'),
      signAsync: jest.fn(async () => 'jwt-token'),
      verify: jest.fn(),
    } as any;

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const env: Record<string, string> = {
          JWT_ACCESS_SECRET: 'access-secret',
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_ACCESS_EXPIRY: '15m',
          JWT_REFRESH_EXPIRY: '7d',
          PASSWORD_RESET_TOKEN_EXPIRY_MINUTES: '30',
        };
        return env[key] ?? defaultValue;
      }),
    } as any;

    mfaService = {
      decryptSecret: jest.fn(() => 'decrypted-secret'),
      verifyTotp: jest.fn(() => true),
      verifyBackupCode: jest.fn(async () => ({ valid: false, index: -1 })),
    } as any;

    mailService = {
      sendPasswordResetEmail: jest.fn(async () => {}),
      sendPasswordChangeConfirmation: jest.fn(async () => {}),
    } as any;

    auditLog = {
      log: jest.fn(async () => {}),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: authRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: MfaService, useValue: mfaService },
        { provide: MailService, useValue: mailService },
        { provide: AuditLogUtil, useValue: auditLog },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should throw if user not found', async () => {
      authRepository.findByEmail.mockResolvedValue(null);
      await expect(service.login('x@x.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw if user is inactive', async () => {
      authRepository.findByEmail.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });
      await expect(service.login('x@x.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw if password is invalid', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);
      await expect(service.login('x@x.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return mfaRequired if MFA is enabled', async () => {
      authRepository.findByEmail.mockResolvedValue(mockMfaUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
      jwtService.sign.mockReturnValue('mfa-token');

      const result = await service.login('test@example.com', 'pass');
      expect(result.mfaRequired).toBe(true);
      expect(result.mfaToken).toBe('mfa-token');
      expect(result.accessToken).toBeUndefined();
    });

    it('should return tokens if MFA is not enabled', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValue('jwt-token');

      const result = await service.login('test@example.com', 'pass');
      expect(result.mfaRequired).toBe(false);
      expect(result.accessToken).toBe('jwt-token');
      expect(result.refreshToken).toBe('jwt-token');
      expect(authRepository.createRefreshToken).toHaveBeenCalled();
    });
  });

  describe('verifyMfaLogin', () => {
    it('should throw for invalid MFA token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      await expect(
        service.verifyMfaLogin('bad-token', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for wrong MFA token type', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', type: 'wrong' });
      await expect(service.verifyMfaLogin('token', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw if user MFA not configured', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', type: 'mfa-pending' });
      authRepository.findById.mockResolvedValue(mockUser);
      await expect(service.verifyMfaLogin('token', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return tokens on valid TOTP code', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', type: 'mfa-pending' });
      authRepository.findById.mockResolvedValue(mockMfaUser);
      mfaService.verifyTotp.mockReturnValue(true);
      jwtService.signAsync.mockResolvedValue('jwt-token');

      const result = await service.verifyMfaLogin('token', '123456');
      expect(result.accessToken).toBe('jwt-token');
      expect(result.user.mfaEnabled).toBe(true);
    });

    it('should return tokens on valid backup code', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', type: 'mfa-pending' });
      authRepository.findById.mockResolvedValue(mockMfaUser);
      mfaService.verifyTotp.mockReturnValue(false);
      mfaService.verifyBackupCode.mockResolvedValue({ valid: true, index: 0 });
      jwtService.signAsync.mockResolvedValue('jwt-token');

      const result = await service.verifyMfaLogin('token', 'backup');
      expect(result.accessToken).toBe('jwt-token');
      expect(authRepository.updateBackupCodes).toHaveBeenCalled();
    });

    it('should throw for invalid MFA code', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', type: 'mfa-pending' });
      authRepository.findById.mockResolvedValue(mockMfaUser);
      mfaService.verifyTotp.mockReturnValue(false);
      mfaService.verifyBackupCode.mockResolvedValue({
        valid: false,
        index: -1,
      });

      await expect(service.verifyMfaLogin('token', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshToken', () => {
    it('should throw if no token provided', async () => {
      await expect(service.refreshToken('')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw for invalid JWT', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      await expect(service.refreshToken('bad')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw if token not found in DB', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        email: 'x@x.com',
        role: 'admin',
      });
      authRepository.findRefreshToken.mockResolvedValue(null);
      await expect(service.refreshToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should revoke all tokens on reuse detection', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        email: 'x@x.com',
        role: 'admin',
      });
      authRepository.findRefreshToken.mockResolvedValue({
        id: '1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 86400000),
        revoked: true,
        createdAt: new Date(),
      });
      await expect(service.refreshToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('should throw if token expired', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        email: 'x@x.com',
        role: 'admin',
      });
      authRepository.findRefreshToken.mockResolvedValue({
        id: '1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date('2020-01-01'),
        revoked: false,
        createdAt: new Date(),
      });
      await expect(service.refreshToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return new tokens on valid refresh', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        email: 'x@x.com',
        role: 'admin',
      });
      authRepository.findRefreshToken.mockResolvedValue({
        id: '1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 86400000),
        revoked: false,
        createdAt: new Date(),
      });
      authRepository.findById.mockResolvedValue(mockUser);
      jwtService.signAsync.mockResolvedValue('new-token');

      const result = await service.refreshToken('token');
      expect(result.accessToken).toBe('new-token');
      expect(authRepository.revokeRefreshToken).toHaveBeenCalled();
      expect(authRepository.createRefreshToken).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should revoke the token', async () => {
      await service.logout('token');
      expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith(
        'hashed_token',
      );
    });

    it('should handle null token gracefully', async () => {
      const result = await service.logout('');
      expect(result.message).toContain('Logged out');
    });
  });

  describe('getProfile', () => {
    it('should throw if user not found', async () => {
      authRepository.findById.mockResolvedValue(null);
      await expect(service.getProfile('bad-id')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return user profile', async () => {
      authRepository.findById.mockResolvedValue(mockUser);
      const result = await service.getProfile('user-1');
      expect(result.email).toBe('test@example.com');
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('forgotPassword', () => {
    it('should always return same message regardless of email existence', async () => {
      authRepository.findByEmail.mockResolvedValue(null);
      const result = await service.forgotPassword('x@x.com');
      expect(result.message).toContain('password reset');
    });

    it('should send email if user exists', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);
      await service.forgotPassword('test@example.com');
      expect(authRepository.createPasswordResetToken).toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should throw for invalid token', async () => {
      authRepository.findPasswordResetToken.mockResolvedValue(null);
      await expect(service.resetPassword('bad', 'NewPass123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw for used token', async () => {
      authRepository.findPasswordResetToken.mockResolvedValue({
        id: '1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 86400000),
        used: true,
        createdAt: new Date(),
      });
      await expect(
        service.resetPassword('token', 'NewPass123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw for expired token', async () => {
      authRepository.findPasswordResetToken.mockResolvedValue({
        id: '1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date('2020-01-01'),
        used: false,
        createdAt: new Date(),
      });
      await expect(
        service.resetPassword('token', 'NewPass123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reset password and revoke all sessions', async () => {
      authRepository.findPasswordResetToken.mockResolvedValue({
        id: '1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 86400000),
        used: false,
        createdAt: new Date(),
      });
      authRepository.findById.mockResolvedValue(mockUser);

      const result = await service.resetPassword('token', 'NewPass123');
      expect(result.message).toContain('reset');
      expect(authRepository.updatePassword).toHaveBeenCalled();
      expect(authRepository.markPasswordResetTokenUsed).toHaveBeenCalled();
      expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith(
        'user-1',
      );
      expect(auditLog.log).toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('should throw if user not found', async () => {
      authRepository.findById.mockResolvedValue(null);
      await expect(
        service.changePassword('bad', 'old', 'newPass123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw if current password wrong', async () => {
      authRepository.findById.mockResolvedValue(mockUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);
      await expect(
        service.changePassword('user-1', 'wrong', 'newPass123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should update password and revoke sessions', async () => {
      authRepository.findById.mockResolvedValue(mockUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
      jest.spyOn(require('bcrypt'), 'hash').mockResolvedValue('hashed-new');

      const result = await service.changePassword(
        'user-1',
        'current',
        'NewPass123',
      );
      expect(result.message).toContain('changed');
      expect(authRepository.updatePassword).toHaveBeenCalled();
      expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith(
        'user-1',
      );
      expect(auditLog.log).toHaveBeenCalled();
    });
  });
});
