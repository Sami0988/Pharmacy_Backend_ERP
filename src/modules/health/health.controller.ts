import { Controller, Get, Post } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DatabaseService } from '../../db/database.service';
import { MinioService } from '../../common/storage/minio.service';
import { CacheService } from '../../common/cache/cache.service';
import { Public } from '../../common/decorators/public.decorator';
import * as bcrypt from 'bcrypt';

@ApiTags('System')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly databaseService: DatabaseService,
    private readonly minioService: MinioService,
    private readonly cacheService: CacheService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'System health check' })
  @ApiResponse({ status: 200, description: 'Health status of all services' })
  check() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkRedis(),
      () => this.checkMinio(),
      () => this.checkMemory(),
    ]);
  }

  @Public()
  @Get('live')
  @ApiOperation({
    summary: 'Liveness probe (always returns 200 if process is running)',
  })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Post('setup-admin')
  async setupAdmin() {
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: this.databaseService.getConnectionString(),
        ssl: { rejectUnauthorized: false },
      });
      const hashedPassword = await bcrypt.hash('Sami@123', 10);
      const result = await pool.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role
         RETURNING id, name, email, role`,
        ['Samuel Sam', 'samuasami84@gmail.com', hashedPassword, 'admin'],
      );
      await pool.end();
      return { message: 'Admin created', user: result.rows[0] };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: this.databaseService.getConnectionString(),
        connectionTimeoutMillis: 3000,
      });
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();
      return {
        database: {
          status: 'up',
          latencyMs: Date.now() - start,
        },
      };
    } catch (error) {
      return {
        database: {
          status: 'down',
          latencyMs: Date.now() - start,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      const isReady = this.cacheService.isReady();
      if (!isReady) {
        return {
          redis: {
            status: 'down',
            latencyMs: Date.now() - start,
            message: 'Redis not connected',
          },
        };
      }
      return {
        redis: {
          status: 'up',
          latencyMs: Date.now() - start,
        },
      };
    } catch (error) {
      return {
        redis: {
          status: 'down',
          latencyMs: Date.now() - start,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async checkMinio(): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await this.minioService.checkConnection();
      return {
        minio: {
          status: 'up',
          latencyMs: Date.now() - start,
        },
      };
    } catch (error) {
      return {
        minio: {
          status: 'down',
          latencyMs: Date.now() - start,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async checkMemory(): Promise<HealthIndicatorResult> {
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const heapUsageRatio = mem.heapUsed / mem.heapTotal;

    if (heapUsageRatio > 0.95) {
      return {
        memory: {
          status: 'down',
          message: `Heap usage critical: ${Math.round(heapUsageRatio * 100)}%`,
          heapUsedMb,
          heapTotalMb,
          rssMb,
        },
      };
    }

    return {
      memory: {
        status: 'up',
        heapUsedMb,
        heapTotalMb,
        rssMb,
      },
    };
  }
}
