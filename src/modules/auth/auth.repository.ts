import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import {
  users,
  refreshTokens,
  passwordResetTokens,
  loginHistory,
} from '../../db';
import { eq, lt, desc, and } from 'drizzle-orm';
import * as crypto from 'crypto';

@Injectable()
export class AuthRepository {
  private readonly logger = new Logger(AuthRepository.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async findByEmail(email: string) {
    const result = await this.databaseService.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return result[0] || null;
  }

  async findById(id: string) {
    const result = await this.databaseService.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return result[0] || null;
  }

  async updatePassword(userId: string, passwordHash: string) {
    await this.databaseService.db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));
  }

  // Refresh token operations
  async createRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    const [row] = await this.databaseService.db
      .insert(refreshTokens)
      .values({
        userId,
        tokenHash,
        expiresAt,
      })
      .returning();
    return row;
  }

  async findRefreshToken(tokenHash: string) {
    const result = await this.databaseService.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return result[0] || null;
  }

  async revokeRefreshToken(tokenHash: string) {
    await this.databaseService.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  }

  async revokeAllUserRefreshTokens(userId: string) {
    await this.databaseService.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.userId, userId));
  }

  async deleteExpiredRefreshTokens() {
    await this.databaseService.db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, new Date()));
  }

  // Password reset token operations
  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    const [row] = await this.databaseService.db
      .insert(passwordResetTokens)
      .values({
        userId,
        tokenHash,
        expiresAt,
      })
      .returning();
    return row;
  }

  async findPasswordResetToken(tokenHash: string) {
    const result = await this.databaseService.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    return result[0] || null;
  }

  async markPasswordResetTokenUsed(tokenId: string) {
    await this.databaseService.db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, tokenId));
  }

  // MFA operations
  async updateMfaSecret(userId: string, encryptedSecret: string) {
    await this.databaseService.db
      .update(users)
      .set({ mfaSecretEncrypted: encryptedSecret })
      .where(eq(users.id, userId));
  }

  async enableMfa(userId: string, backupCodes: string[]) {
    await this.databaseService.db
      .update(users)
      .set({
        mfaEnabled: true,
        mfaBackupCodes: backupCodes,
      })
      .where(eq(users.id, userId));
  }

  async disableMfa(userId: string) {
    await this.databaseService.db
      .update(users)
      .set({
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaBackupCodes: null,
      })
      .where(eq(users.id, userId));
  }

  async updateBackupCodes(userId: string, backupCodes: string[]) {
    await this.databaseService.db
      .update(users)
      .set({ mfaBackupCodes: backupCodes })
      .where(eq(users.id, userId));
  }

  // Login history operations
  async createLoginHistory(data: {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
  }) {
    const [row] = await this.databaseService.db
      .insert(loginHistory)
      .values({
        userId: data.userId,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        success: data.success,
        failureReason: data.failureReason ?? null,
      })
      .returning();
    return row;
  }

  async getLoginHistory(userId: string, limit = 20, offset = 0) {
    return this.databaseService.db
      .select()
      .from(loginHistory)
      .where(eq(loginHistory.userId, userId))
      .orderBy(desc(loginHistory.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getLoginHistoryCount(userId: string) {
    const result = await this.databaseService.db
      .select({ count: loginHistory.id })
      .from(loginHistory)
      .where(eq(loginHistory.userId, userId));
    return result.length;
  }

  // Session operations
  async getActiveSessions(userId: string) {
    return this.databaseService.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.revoked, false),
        ),
      )
      .orderBy(desc(refreshTokens.createdAt));
  }

  async revokeSession(sessionId: string, userId: string) {
    const result = await this.databaseService.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(
        and(
          eq(refreshTokens.id, sessionId),
          eq(refreshTokens.userId, userId),
        ),
      )
      .returning();
    return result.length > 0;
  }

  // Profile operations
  async updateProfile(userId: string, data: { name?: string; profileImage?: string }) {
    await this.databaseService.db
      .update(users)
      .set(data)
      .where(eq(users.id, userId));
  }

  // Token hashing utility
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  generateRandomToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
