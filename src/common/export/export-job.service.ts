import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ExportJobProcessor } from './export-job.processor';

export interface ExportJobData {
  jobId: string;
  type: 'stock' | 'expiry' | 'sales' | 'supplier-balance';
  format: 'pdf' | 'csv';
  params: Record<string, unknown>;
  userId: string;
}

export interface ExportJobStatus {
  jobId: string;
  status: 'completed' | 'failed';
  result?: {
    fileUrl: string;
    fileName: string;
  };
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

const jobResults = new Map<string, ExportJobStatus>();

@Injectable()
export class ExportJobService {
  private readonly logger = new Logger(ExportJobService.name);

  constructor(
    private readonly exportJobProcessor: ExportJobProcessor,
  ) {}

  async createExportJob(
    type: ExportJobData['type'],
    format: ExportJobData['format'],
    params: Record<string, unknown>,
    userId: string,
  ): Promise<{ jobId: string; status: string }> {
    const jobId = randomUUID();

    const status: ExportJobStatus = {
      jobId,
      status: 'completed',
      createdAt: new Date(),
    };

    jobResults.set(jobId, status);

    try {
      this.logger.log(`Processing export job: ${jobId} (${type}, ${format})`);
      const result = await this.exportJobProcessor.process(type, format, params);
      status.status = 'completed';
      status.result = result.result;
      status.completedAt = new Date();
      this.logger.log(`Export job completed: ${jobId}`);
    } catch (error) {
      status.status = 'failed';
      status.error = error instanceof Error ? error.message : String(error);
      status.completedAt = new Date();
      this.logger.error(`Export job failed: ${jobId}`, error);
    }

    return { jobId, status: status.status };
  }

  async getJobStatus(jobId: string): Promise<ExportJobStatus | null> {
    return jobResults.get(jobId) ?? null;
  }
}
