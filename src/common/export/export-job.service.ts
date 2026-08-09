import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';

export interface ExportJobData {
  jobId: string;
  type: 'stock' | 'expiry' | 'sales' | 'supplier-balance';
  format: 'pdf' | 'csv';
  params: Record<string, unknown>;
  userId: string;
}

export interface ExportJobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: {
    fileUrl: string;
    fileName: string;
  };
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

@Injectable()
export class ExportJobService {
  private readonly logger = new Logger(ExportJobService.name);

  constructor(
    @InjectQueue('export-jobs') private exportQueue: Queue,
  ) {}

  async createExportJob(
    type: ExportJobData['type'],
    format: ExportJobData['format'],
    params: Record<string, unknown>,
    userId: string,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();

    const jobData: ExportJobData = {
      jobId,
      type,
      format,
      params,
      userId,
    };

    await this.exportQueue.add('export', jobData, {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400, // Keep completed jobs for 24 hours
      },
      removeOnFail: {
        age: 86400,
      },
    });

    this.logger.log(`Export job created: ${jobId} (${type}, ${format})`);

    return { jobId };
  }

  async getJobStatus(jobId: string): Promise<ExportJobStatus | null> {
    const job = await this.exportQueue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const data = job.data as ExportJobData;

    let status: ExportJobStatus['status'];
    switch (state) {
      case 'waiting':
      case 'delayed':
        status = 'queued';
        break;
      case 'active':
        status = 'processing';
        break;
      case 'completed':
        status = 'completed';
        break;
      case 'failed':
        status = 'failed';
        break;
      default:
        status = 'queued';
    }

    return {
      jobId,
      status,
      result: job.returnvalue?.result,
      error: job.failedReason,
      createdAt: new Date(job.timestamp),
      completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
    };
  }
}
