import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const corsOrigins = configService.get<string>(
    'CORS_ALLOWED_ORIGINS',
    configService.get<string>('FRONTEND_URL', 'http://localhost:3000'),
  );
  const allowedOrigins = corsOrigins.split(',').map((o) => o.trim());

  app.enableCors({
    origin: (origin: any, callback: any) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Pharmacy ERP API')
    .setDescription(
      'Backend API for the Pharmacy ERP system. Handles authentication, inventory management, ' +
        'goods receipts, batch tracking, stock transfers, supplier payments, and more.',
    )
    .setVersion('1.0')
    .setBasePath('api/v1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token',
      },
      'jwt-access',
    )
    .addTag('Auth', 'Login, registration, MFA, and password management')
    .addTag('Items', 'Product catalog management')
    .addTag('Suppliers', 'Supplier management')
    .addTag('Goods Receipts', 'Purchase order receiving and GRN creation')
    .addTag('Batches', 'Batch tracking and QR codes')
    .addTag('Stock Movements', 'Inventory movement tracking')
    .addTag('Supplier Payments', 'Payment recording and balance tracking')
    .addTag('Transfers', 'Inter-location stock transfers with FEFO')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 301;
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
}
void bootstrap();
