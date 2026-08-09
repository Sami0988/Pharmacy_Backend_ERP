import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.from = this.configService.get<string>('SMTP_FROM')!;
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL')!;

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h1 { color: #2c5282; margin: 0; }
          .content { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
          .button { display: inline-block; background: #2c5282; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold; margin: 10px 0; }
          .footer { text-align: center; font-size: 12px; color: #666; margin-top: 20px; }
          .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 4px; margin: 15px 0; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Pharmacy ERP</h1>
          </div>
          <div class="content">
            <h2>Password Reset Request</h2>
            <p>You requested a password reset for your account. Click the button below to set a new password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <div class="warning">
              <strong>This link expires in 30 minutes.</strong> If you did not request this reset, please ignore this email. Your password will remain unchanged.
            </div>
          </div>
          <div class="footer">
            <p>Pharmacy ERP &mdash; Secure Pharmacy Management</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Pharmacy ERP - Password Reset Request',
      html,
    });
  }

  async sendPasswordChangeConfirmation(email: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h1 { color: #2c5282; margin: 0; }
          .content { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; font-size: 12px; color: #666; margin-top: 20px; }
          .success { background: #d4edda; border: 1px solid #28a745; padding: 10px; border-radius: 4px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Pharmacy ERP</h1>
          </div>
          <div class="content">
            <h2>Password Changed Successfully</h2>
            <div class="success">
              Your password has been changed. All previous sessions have been invalidated.
            </div>
            <p>If you did not make this change, please contact your administrator immediately.</p>
          </div>
          <div class="footer">
            <p>Pharmacy ERP &mdash; Secure Pharmacy Management</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Pharmacy ERP - Password Changed',
      html,
    });
  }
}
