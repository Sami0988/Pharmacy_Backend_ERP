import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { ExportJobService } from './export-job.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

class CreateExportJobDto {
  type: 'stock' | 'expiry' | 'sales' | 'supplier-balance';
  format: 'pdf' | 'csv';
  params?: Record<string, unknown>;
}

@ApiTags('Reports')
@ApiBearerAuth('jwt-access')
@Controller('reports/export')
export class ExportJobController {
  constructor(private readonly exportJobService: ExportJobService) {}

  @Post()
  @Roles('admin', 'store_keeper')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a large report export job' })
  @ApiBody({ type: CreateExportJobDto })
  @ApiResponse({
    status: 201,
    description: 'Export job created, returns job ID for polling',
  })
  async createExportJob(
    @Body() dto: CreateExportJobDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.exportJobService.createExportJob(
      dto.type,
      dto.format,
      dto.params || {},
      userId,
    );
  }

  @Get(':jobId/status')
  @Roles('admin', 'store_keeper')
  @ApiOperation({ summary: 'Check export job status' })
  @ApiParam({ name: 'jobId', description: 'Export job UUID' })
  @ApiResponse({ status: 200, description: 'Job status with result URL if completed' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.exportJobService.getJobStatus(jobId);
    if (!status) {
      return { status: 'not_found' };
    }
    return status;
  }
}
