import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthRepository } from './auth.repository';
import { MfaService } from './mfa/mfa.service';
import { MailService } from './mail/mail.service';
import { AuditLogUtil } from '../../common/utils/audit-log.util';

interface MfaPendingPayload {
  sub: string;
  type: 'mfa-pending';
}

interface RefreshTokenPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly maxMfaAttempts = 5;
  private readonly mfaAttemptTtlMs = 15 * 60 * 1000; // 15 minutes
  private readonly mfaAttempts = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mfaService: MfaService,
    private readonly mailService: MailService,
    private readonly auditLog: AuditLogUtil,
  ) {}

  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      await this.authRepository.createLoginHistory({
        userId: user.id,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Account is deactivated',
      });
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.authRepository.createLoginHistory({
        userId: user.id,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Invalid password',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.mfaEnabled) {
      const mfaToken = this.jwtService.sign(
        { sub: user.id, type: 'mfa-pending' },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: '5m',
        },
      );

      return {
        mfaRequired: true,
        mfaToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          branchId: user.branchId ?? null,
        },
      };
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, false, user.branchId);
    await this.authRepository.createRefreshToken(
      user.id,
      this.authRepository.hashToken(tokens.refreshToken),
      this.getRefreshTokenExpiry(),
    );

    await this.authRepository.createLoginHistory({
      userId: user.id,
      ipAddress,
      userAgent,
      success: true,
    });

    return {
      mfaRequired: false,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mfaEnabled: false,
        branchId: user.branchId ?? null,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async verifyMfaLogin(mfaToken: string, code: string) {
    let payload: MfaPendingPayload;
    try {
      payload = this.jwtService.verify<MfaPendingPayload>(mfaToken, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    if (payload.type !== 'mfa-pending') {
      throw new UnauthorizedException('Invalid MFA token type');
    }

    // Check brute-force protection
    const attemptKey = payload.sub;
    const attempt = this.mfaAttempts.get(attemptKey);
    if (attempt) {
      if (attempt.count >= this.maxMfaAttempts) {
        if (Date.now() < attempt.resetAt) {
          const minutesLeft = Math.ceil((attempt.resetAt - Date.now()) / 60000);
          throw new UnauthorizedException(
            `Too many MFA attempts. Try again in ${minutesLeft} minute(s)`,
          );
        }
        this.mfaAttempts.delete(attemptKey);
      }
    }

    const user = await this.authRepository.findById(payload.sub);
    if (!user || !user.mfaEnabled || !user.mfaSecretEncrypted) {
      throw new UnauthorizedException('MFA not configured for this user');
    }

    const decryptedSecret = this.mfaService.decryptSecret(
      user.mfaSecretEncrypted,
    );
    const totpValid = this.mfaService.verifyTotp(decryptedSecret, code);

    if (totpValid) {
      this.mfaAttempts.delete(attemptKey);
      const tokens = await this.generateTokens(
        user.id,
        user.email,
        user.role,
        true,
        user.branchId,
      );
      await this.authRepository.createRefreshToken(
        user.id,
        this.authRepository.hashToken(tokens.refreshToken),
        this.getRefreshTokenExpiry(),
      );

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mfaEnabled: true,
          branchId: user.branchId ?? null,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    }

    const backupCodes = (user.mfaBackupCodes as string[]) || [];
    if (backupCodes.length > 0) {
      const backupResult = await this.mfaService.verifyBackupCode(
        backupCodes,
        code,
      );
      if (backupResult.valid) {
        this.mfaAttempts.delete(attemptKey);
        const newBackupCodes = [...backupCodes];
        newBackupCodes.splice(backupResult.index, 1);
        await this.authRepository.updateBackupCodes(user.id, newBackupCodes);

        const tokens = await this.generateTokens(
          user.id,
          user.email,
          user.role,
          true,
          user.branchId,
        );
        await this.authRepository.createRefreshToken(
          user.id,
          this.authRepository.hashToken(tokens.refreshToken),
          this.getRefreshTokenExpiry(),
        );

        return {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            mfaEnabled: true,
            branchId: user.branchId ?? null,
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        };
      }
    }

    // Increment failed attempt counter
    const current = this.mfaAttempts.get(attemptKey);
    const newCount = (current?.count ?? 0) + 1;
    this.mfaAttempts.set(attemptKey, {
      count: newCount,
      resetAt: Date.now() + this.mfaAttemptTtlMs,
    });

    throw new UnauthorizedException('Invalid MFA code');
  }

  async refreshToken(refreshTokenRaw: string) {
    if (!refreshTokenRaw) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshTokenRaw, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.authRepository.hashToken(refreshTokenRaw);
    const storedToken = await this.authRepository.findRefreshToken(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    if (storedToken.revoked) {
      this.logger.warn(
        `Refresh token reuse detected for user ${payload.sub}. Revoking all sessions.`,
      );
      await this.authRepository.revokeAllUserRefreshTokens(payload.sub);
      throw new UnauthorizedException(
        'Refresh token reuse detected. All sessions revoked. Please log in again.',
      );
    }

    if (new Date(storedToken.expiresAt) < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.authRepository.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    await this.authRepository.revokeRefreshToken(tokenHash);

    const tokens = await this.generateTokens(user.id, user.email, user.role, false, user.branchId);
    await this.authRepository.createRefreshToken(
      user.id,
      this.authRepository.hashToken(tokens.refreshToken),
      this.getRefreshTokenExpiry(),
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(refreshTokenRaw: string) {
    if (refreshTokenRaw) {
      const tokenHash = this.authRepository.hashToken(refreshTokenRaw);
      await this.authRepository.revokeRefreshToken(tokenHash);
    }
    return { message: 'Logged out successfully' };
  }

  async getProfile(userId: string) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
      branchId: user.branchId ?? null,
    };
  }

  async forgotPassword(email: string) {
    const user = await this.authRepository.findByEmail(email);

    if (user) {
      const rawToken = this.authRepository.generateRandomToken();
      const tokenHash = this.authRepository.hashToken(rawToken);
      const expiryMinutes = this.configService.get<number>(
        'PASSWORD_RESET_TOKEN_EXPIRY_MINUTES',
        30,
      );
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

      await this.authRepository.createPasswordResetToken(
        user.id,
        tokenHash,
        expiresAt,
      );

      try {
        await this.mailService.sendPasswordResetEmail(email, rawToken);
      } catch (error) {
        this.logger.error(
          `Failed to send password reset email: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.authRepository.hashToken(token);
    const storedToken =
      await this.authRepository.findPasswordResetToken(tokenHash);

    if (!storedToken || storedToken.used) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (new Date(storedToken.expiresAt) < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const user = await this.authRepository.findById(storedToken.userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.authRepository.updatePassword(user.id, hashedPassword);
    await this.authRepository.markPasswordResetTokenUsed(storedToken.id);
    await this.authRepository.revokeAllUserRefreshTokens(user.id);

    try {
      await this.mailService.sendPasswordChangeConfirmation(user.email);
    } catch (error) {
      this.logger.error(
        `Failed to send password change confirmation: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.auditLog.log({
      userId: user.id,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: user.id,
    });

    return { message: 'Password has been reset successfully' };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const passwordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.authRepository.updatePassword(user.id, hashedPassword);
    await this.authRepository.revokeAllUserRefreshTokens(user.id);

    await this.auditLog.log({
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: user.id,
    });

    return { message: 'Password changed successfully. Please log in again.' };
  }

  async getSessions(userId: string) {
    const sessions = await this.authRepository.getActiveSessions(userId);
    return sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const revoked = await this.authRepository.revokeSession(sessionId, userId);
    if (!revoked) {
      throw new BadRequestException('Session not found');
    }
    return { message: 'Session revoked successfully' };
  }

  async getLoginHistory(userId: string, limit = 20, offset = 0) {
    const [history, count] = await Promise.all([
      this.authRepository.getLoginHistory(userId, limit, offset),
      this.authRepository.getLoginHistoryCount(userId),
    ]);
    return {
      data: history.map((h) => ({
        id: h.id,
        ipAddress: h.ipAddress,
        userAgent: h.userAgent,
        success: h.success,
        failureReason: h.failureReason,
        createdAt: h.createdAt,
      })),
      total: count,
      limit,
      offset,
    };
  }

  async updateName(userId: string, name: string) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.authRepository.updateProfile(userId, { name });

    await this.auditLog.log({
      userId,
      action: 'PROFILE_NAME_UPDATED',
      entityType: 'user',
      entityId: userId,
      beforeData: { name: user.name },
      afterData: { name },
    });

    return { message: 'Name updated successfully', name };
  }

  async updateProfileImage(userId: string, imageUrl: string) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.authRepository.updateProfile(userId, { profileImage: imageUrl });

    await this.auditLog.log({
      userId,
      action: 'PROFILE_IMAGE_UPDATED',
      entityType: 'user',
      entityId: userId,
      beforeData: { profileImage: user.profileImage },
      afterData: { profileImage: imageUrl },
    });

    return { message: 'Profile image updated successfully', profileImage: imageUrl };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    mfaVerified = false,
    branchId?: string | null,
  ) {
    const payload = { sub: userId, email, role, mfaVerified, branchId };

    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET')!;
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET')!;
    const accessExpiry = this.configService.get<string>(
      'JWT_ACCESS_EXPIRY',
      '15m',
    );
    const refreshExpiry = this.configService.get<string>(
      'JWT_REFRESH_EXPIRY',
      '7d',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,

        expiresIn: accessExpiry as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,

        expiresIn: refreshExpiry as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private getRefreshTokenExpiry(): Date {
    const refreshExpiry = this.configService.get<string>(
      'JWT_REFRESH_EXPIRY',
      '7d',
    );
    const match = refreshExpiry.match(/^(\d+)([dhm])$/);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 'd':
        return new Date(Date.now() + value * 24 * 60 * 60 * 1000);
      case 'h':
        return new Date(Date.now() + value * 60 * 60 * 1000);
      case 'm':
        return new Date(Date.now() + value * 60 * 1000);
      default:
        return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  }
}
