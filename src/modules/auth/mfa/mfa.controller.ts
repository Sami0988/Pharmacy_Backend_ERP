import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MfaService } from './mfa.service';
import { AuthRepository } from '../auth.repository';
import { VerifyTotpDto } from '../dto/verify-totp.dto';
import { AuditLogUtil } from '../../../common/utils/audit-log.util';

@ApiTags('Auth')
@Controller('auth/mfa')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt-access')
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly authRepository: AuthRepository,
    private readonly auditLog: AuditLogUtil,
  ) {}

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize MFA setup — generates secret and QR code',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns QR code data URL and secret for authenticator app',
  })
  @ApiResponse({
    status: 400,
    description: 'MFA already enabled or user not found',
  })
  async setup(@CurrentUser('sub') userId: string) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const secret = this.mfaService.generateSecret(user.email);
    const encryptedSecret = this.mfaService.encryptSecret(secret.base32);
    const qrCodeDataUrl = await this.mfaService.generateQrCodeDataUrl(
      secret.otpauth_url!,
    );

    await this.authRepository.updateMfaSecret(userId, encryptedSecret);

    return {
      otpauthUrl: secret.otpauth_url,
      qrCodeDataUrl,
      secret: secret.base32,
    };
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable MFA after verifying TOTP code' })
  @ApiBody({ type: VerifyTotpDto })
  @ApiResponse({
    status: 200,
    description: 'MFA enabled, returns backup codes',
  })
  @ApiResponse({ status: 400, description: 'Invalid code or MFA not set up' })
  async enable(@CurrentUser('sub') userId: string, @Body() dto: VerifyTotpDto) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }
    if (!user.mfaSecretEncrypted) {
      throw new BadRequestException('Please run MFA setup first');
    }

    const decryptedSecret = this.mfaService.decryptSecret(
      user.mfaSecretEncrypted,
    );
    const isValid = this.mfaService.verifyTotp(decryptedSecret, dto.code);

    if (!isValid) {
      throw new BadRequestException('Invalid MFA code');
    }

    const backupCodes = this.mfaService.generateBackupCodes(10);
    const hashedBackupCodes =
      await this.mfaService.hashBackupCodes(backupCodes);

    await this.authRepository.enableMfa(userId, hashedBackupCodes);

    await this.auditLog.log({
      userId,
      action: 'MFA_ENABLED',
      entityType: 'user',
      entityId: userId,
    });

    return {
      message: 'MFA enabled successfully',
      backupCodes,
    };
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable MFA (requires password + TOTP code)' })
  @ApiResponse({ status: 200, description: 'MFA disabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid password or code' })
  async disable(
    @CurrentUser('sub') userId: string,
    @Body() body: { code: string; password: string },
  ) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (!user.mfaEnabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    const passwordValid = await bcrypt.compare(
      body.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new BadRequestException('Invalid password');
    }

    if (user.mfaSecretEncrypted) {
      const decryptedSecret = this.mfaService.decryptSecret(
        user.mfaSecretEncrypted,
      );
      const codeValid = this.mfaService.verifyTotp(decryptedSecret, body.code);
      const backupCodes = (user.mfaBackupCodes as string[]) || [];
      const backupValid = await this.mfaService.verifyBackupCode(
        backupCodes,
        body.code,
      );

      if (!codeValid && !backupValid.valid) {
        throw new BadRequestException('Invalid MFA code or backup code');
      }
    }

    await this.authRepository.disableMfa(userId);

    await this.auditLog.log({
      userId,
      action: 'MFA_DISABLED',
      entityType: 'user',
      entityId: userId,
    });

    return { message: 'MFA disabled successfully' };
  }

  @Post('regenerate-backup-codes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate backup codes (requires password)' })
  @ApiBody({
    schema: {
      properties: { password: { type: 'string', example: 'admin123' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Returns new backup codes' })
  @ApiResponse({
    status: 400,
    description: 'Invalid password or MFA not enabled',
  })
  async regenerateBackupCodes(
    @CurrentUser('sub') userId: string,
    @Body() body: { password: string },
  ) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (!user.mfaEnabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    const passwordValid = await bcrypt.compare(
      body.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new BadRequestException('Invalid password');
    }

    const backupCodes = this.mfaService.generateBackupCodes(10);
    const hashedBackupCodes =
      await this.mfaService.hashBackupCodes(backupCodes);

    await this.authRepository.updateBackupCodes(userId, hashedBackupCodes);

    await this.auditLog.log({
      userId,
      action: 'MFA_BACKUP_CODES_REGENERATED',
      entityType: 'user',
      entityId: userId,
    });

    return {
      message: 'Backup codes regenerated successfully',
      backupCodes,
    };
  }
}
