import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { auditLog } from '../../db';

export interface AuditLogEntry {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}

@Injectable()
export class AuditLogUtil {
  private readonly logger = new Logger(AuditLogUtil.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.databaseService.db.insert(auditLog).values({
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeData: entry.beforeData ?? null,
        afterData: entry.afterData ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
