import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './index';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  public db: NodePgDatabase<typeof schema>;
  private connectionString: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.connectionString = this.configService.get<string>('DATABASE_URL')!;
    this.pool = new Pool({
      connectionString: this.connectionString,
    });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  getConnectionString(): string {
    return this.connectionString;
  }
}
