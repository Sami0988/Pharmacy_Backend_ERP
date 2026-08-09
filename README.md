# Pharmacy ERP API

Backend API for the Pharmacy ERP system. Built with NestJS, PostgreSQL, and Drizzle ORM.

## Features

- **Authentication**: JWT-based auth with MFA (TOTP) support
- **Inventory Management**: Items, batches, stock movements with FEFO (First Expired, First Out)
- **Goods Receipts**: Purchase order receiving and GRN creation
- **Stock Transfers**: Inter-location transfers with FEFO suggestions
- **Sales**: POS transactions with receipt generation (PDF)
- **Supplier Payments**: Payment recording and balance tracking
- **Notifications**: Real-time alerts for zero stock, low stock, near expiry, expired items
- **Reports**: Sales, inventory, and financial reports with PDF/CSV export
- **Dashboard**: Analytics and summary statistics
- **Traceability**: Batch tracking and product history
- **Health Checks**: PostgreSQL, Redis, and MinIO connectivity monitoring

## Prerequisites

- Node.js 18+ (recommended: 20+)
- pnpm 8+
- PostgreSQL 14+
- Redis 6+
- MinIO (or S3-compatible storage)

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `LOG_LEVEL` | Log level | `debug` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@localhost:5432/pharmacy_erp` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `MINIO_ENDPOINT` | MinIO endpoint | `localhost` |
| `MINIO_PORT` | MinIO port | `9000` |
| `MINIO_USE_SSL` | Use SSL for MinIO | `false` |
| `MINIO_ACCESS_KEY` | MinIO access key | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO secret key | `minioadmin` |
| `JWT_ACCESS_SECRET` | JWT access token secret | `your-random-string` |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | `your-random-string` |
| `JWT_ACCESS_EXPIRY` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRY` | Refresh token expiry | `7d` |
| `MFA_APP_NAME` | MFA app name | `Pharmacy ERP` |
| `MFA_ENCRYPTION_KEY` | MFA encryption key | `your-random-string` |
| `SMTP_HOST` | SMTP server | `smtp.example.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | `your_smtp_user` |
| `SMTP_PASSWORD` | SMTP password | `your_smtp_password` |
| `SMTP_FROM` | Sender email | `Pharmacy ERP <no-reply@pharmacy-erp.local>` |
| `FRONTEND_URL` | Frontend URL | `http://localhost:3000` |
| `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` | Password reset expiry | `30` |
| `CORS_ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:3000` |

## Setup

### 1. Start Dependencies

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, and MinIO.

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Run Database Migrations

```bash
pnpm drizzle-kit migrate
```

### 4. Seed the Database

```bash
pnpm run seed
```

Default admin credentials:
- Email: `admin@pharmacy.local`
- Password: `admin123`

### 5. Start Development Server

```bash
pnpm run start:dev
```

The API will be available at `http://localhost:301/api/v1`

## API Documentation

Swagger documentation is available at: `http://localhost:301/docs`

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm run start` | Start production server |
| `pnpm run start:dev` | Start development server with watch |
| `pnpm run build` | Build for production |
| `pnpm run test` | Run unit tests |
| `pnpm run test:e2e` | Run end-to-end tests |
| `pnpm run test:cov` | Run tests with coverage |
| `pnpm run lint` | Run ESLint |
| `pnpm run format` | Format code with Prettier |
| `pnpm drizzle-kit generate` | Generate migration |
| `pnpm drizzle-kit migrate` | Run migrations |
| `pnpm run seed` | Seed database |

## Database Backup & Restore

### Backup

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh
```

Requires MinIO client (`mc`) installed. Backups are stored in the `backups` bucket.

### Restore

```bash
chmod +x scripts/restore-db.sh
./scripts/restore-db.sh <backup_filename>
```

## Health Checks

- `GET /api/v1/health` - Full health check (PostgreSQL, Redis, MinIO)
- `GET /api/v1/health/live` - Liveness probe

## Project Structure

```
src/
├── main.ts                    # Bootstrap, Swagger, CORS
├── app.module.ts              # Root module
├── common/                    # Shared utilities
│   ├── cache/                 # Redis cache service
│   ├── decorators/            # Custom decorators (@Public, @Roles, etc.)
│   ├── export/                # PDF/CSV export
│   ├── filters/               # Exception filters
│   ├── guards/                # Auth, role, MFA guards
│   ├── interceptors/          # Logging, idempotency interceptors
│   ├── pdf/                   # PDF generation
│   ├── pipes/                 # Validation pipes
│   ├── storage/               # MinIO storage service
│   └── utils/                 # Audit log utility
├── config/                    # Configuration
├── db/                        # Drizzle schemas & migrations
│   ├── *.schema.ts            # Table definitions
│   ├── relations.ts           # Table relations
│   ├── enums.ts               # PostgreSQL enums
│   ├── database.module.ts     # Database module
│   ├── database.service.ts    # Database service
│   └── seed.ts                # Seed script
├── jobs/                      # BullMQ job handlers
└── modules/                   # Feature modules
    ├── auth/                  # Authentication (JWT, MFA)
    ├── batches/               # Batch tracking
    ├── customers/             # Customer management
    ├── dashboard/             # Dashboard analytics
    ├── goods-receipts/        # GRN management
    ├── health/                # Health checks
    ├── items/                 # Product catalog
    ├── notifications/         # Alert system
    ├── reports/               # Reporting
    ├── sales/                 # Sales transactions
    ├── stock-movements/       # Inventory tracking
    ├── supplier-payments/     # Payment management
    ├── suppliers/             # Supplier management
    ├── traceability/          # Batch traceability
    ├── transfers/             # Stock transfers
    └── users/                 # User management
```

## Rate Limiting

- **Global**: 250 requests per minute
- **Login**: 10 requests per minute
- **Forgot Password**: 5 requests per minute
- **Reset Password**: 5 requests per minute

## Idempotency

The following endpoints support idempotency keys:

- `POST /api/v1/sales`
- `POST /api/v1/supplier-payments`
- `POST /api/v1/transfers`

Send an `Idempotency-Key` header (UUID) to prevent duplicate transactions.

## Soft Deletes

Items, suppliers, and customers support soft deletes:

- `DELETE /api/v1/items/:id` - Sets `deleted_at` timestamp
- `DELETE /api/v1/suppliers/:id` - Sets `deleted_at` timestamp
- `DELETE /api/v1/customers/:id` - Sets `deleted_at` timestamp

To include soft-deleted records:
- `GET /api/v1/items?includeDeleted=true`
- `GET /api/v1/suppliers/:id?includeDeleted=true`
- `GET /api/v1/customers?includeDeleted=true`

## License

UNLICENSED
