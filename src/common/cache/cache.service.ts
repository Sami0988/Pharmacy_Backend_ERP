import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis | null = null;
  private readonly defaultTtl: number;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    this.defaultTtl = this.configService.get<number>('CACHE_TTL_SECONDS', 300);

    try {
      this.client = new Redis({
        host,
        port,
        password: this.configService.get<string>('REDIS_PASSWORD'),
        tls: host.includes('upstash.io') ? {} : undefined,
        maxRetriesPerRequest: 3,
        retryStrategy(times: number) {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
        enableReadyCheck: false,
      });

      this.client.on('error', (err) => {
        this.logger.warn(
          `Redis connection error: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

      this.client.on('connect', () => {
        this.logger.log('Redis connected');
      });

      this.client.connect().catch(() => {
        this.logger.warn(
          'Redis unavailable — caching disabled. Requests will proceed without cache.',
        );
      });
    } catch {
      this.logger.warn('Redis unavailable — caching disabled');
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  /**
   * Get a cached value by key
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set a value in cache with TTL
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    try {
      const ttl = ttlSeconds ?? this.defaultTtl;
      await this.client.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      // Silently fail — cache is non-critical
    }
  }

  /**
   * Delete a specific key
   */
  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {
      // Silently fail
    }
  }

  /**
   * Delete all keys matching a pattern using SCAN (non-blocking)
   */
  async delPattern(pattern: string): Promise<void> {
    if (!this.client) return;
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // Silently fail
    }
  }

  /**
   * Delete multiple specific keys at once
   */
  async delMany(keys: string[]): Promise<void> {
    if (!this.client || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      // Silently fail
    }
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.client?.status === 'ready';
  }
}
