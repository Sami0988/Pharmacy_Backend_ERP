import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/db/database.service';
import * as bcrypt from 'bcrypt';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPass123!';
  let userId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-e2e';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-e2e';
    process.env.JWT_ACCESS_EXPIRY = '15m';
    process.env.JWT_REFRESH_EXPIRY = '7d';
    process.env.MFA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    process.env.MFA_APP_NAME = 'TestApp';
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_USER = '';
    process.env.SMTP_PASSWORD = '';
    process.env.SMTP_FROM = 'Test <test@test.com>';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = '30';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    db = app.get(DatabaseService);
  }, 30000);

  afterAll(async () => {
    // Cleanup test data
    if (userId) {
      try {
        await db.db.execute(`DELETE FROM users WHERE id = '${userId}'`);
      } catch {}
    }
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('should reject login with missing fields', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });

    it('should reject login with invalid email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'notanemail', password: 'pass' })
        .expect(400);
    });

    it('should reject login with wrong credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: 'wrong' })
        .expect(401);
    });
  });

  describe('POST /auth/register (via seed)', () => {
    it('should create a test user for auth tests', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      const result = await db.db.execute(
        `INSERT INTO users (name, email, password_hash, role) VALUES ('Test User', '${testEmail}', '${hashedPassword}', 'admin') RETURNING id`,
      );
      userId = result.rows[0].id as string;
      expect(userId).toBeDefined();
    });
  });

  describe('Full auth flow', () => {
    let accessToken: string;
    let refreshTokenCookie: string;

    it('should login successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.mfaRequired).toBe(false);

      accessToken = res.body.accessToken;
      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        refreshTokenCookie = Array.isArray(setCookie)
          ? setCookie.find((c) => c.startsWith('refresh_token=')) || ''
          : setCookie.startsWith('refresh_token=')
            ? setCookie
            : '';
      }
    });

    it('should access protected /auth/me', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(testEmail);
      expect(res.body.role).toBe('admin');
    });

    it('should reject /auth/me without token', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('should refresh tokens', async () => {
      if (!refreshTokenCookie) return;

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      accessToken = res.body.accessToken;
    });

    it('should logout', async () => {
      if (!refreshTokenCookie) return;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', refreshTokenCookie)
        .expect(200);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should always return success message', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' })
        .expect(200);

      expect(res.body.message).toContain('password reset');
    });

    it('should return same message for existing email', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: testEmail })
        .expect(200);

      expect(res.body.message).toContain('password reset');
    });
  });

  describe('POST /auth/change-password', () => {
    it('should reject without auth', () => {
      return request(app.getHttpServer())
        .post('/auth/change-password')
        .send({ currentPassword: 'old', newPassword: 'NewPass123!' })
        .expect(401);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reject invalid token', () => {
      return request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'invalid-token', newPassword: 'NewPass123!' })
        .expect(400);
    });
  });

  describe('MFA endpoints (protected)', () => {
    let accessToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword });
      accessToken = res.body.accessToken;
    });

    it('should reject MFA setup without auth', () => {
      return request(app.getHttpServer()).post('/auth/mfa/setup').expect(401);
    });

    it('should setup MFA', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.otpauthUrl).toBeDefined();
      expect(res.body.qrCodeDataUrl).toBeDefined();
      expect(res.body.secret).toBeDefined();
    });

    it('should reject enable with wrong code', () => {
      return request(app.getHttpServer())
        .post('/auth/mfa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: '000000' })
        .expect(400);
    });
  });
});
