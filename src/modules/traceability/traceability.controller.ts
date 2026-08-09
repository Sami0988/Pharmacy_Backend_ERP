import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { TraceabilityService } from './traceability.service';

@ApiTags('Batch Traceability')
@ApiBearerAuth('jwt-access')
@Controller('batches')
export class TraceabilityController {
  constructor(private readonly traceabilityService: TraceabilityService) {}

  @Get('trace/:batchNo')
  @ApiOperation({ summary: 'Trace batch by human-readable batch number' })
  @ApiParam({ name: 'batchNo', description: 'Batch number (e.g. BATCH-001)' })
  @ApiResponse({ status: 200, description: 'Full traceability data for all matching batches' })
  @ApiResponse({ status: 404, description: 'No batches found matching the given number' })
  traceByBatchNo(@Param('batchNo') batchNo: string) {
    return this.traceabilityService.traceByBatchNo(batchNo);
  }

  @Get('trace-by-id/:batchId')
  @ApiOperation({ summary: 'Trace batch by UUID (QR scan)' })
  @ApiParam({ name: 'batchId', description: 'Batch UUID' })
  @ApiResponse({ status: 200, description: 'Full traceability data for the batch' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  traceByBatchId(@Param('batchId') batchId: string) {
    return this.traceabilityService.traceByBatchId(batchId);
  }

  @Get(':batchId/recall-impact')
  @ApiOperation({ summary: 'Get recall impact data for a batch' })
  @ApiParam({ name: 'batchId', description: 'Batch UUID' })
  @ApiResponse({ status: 200, description: 'Sales history and current stock for recall' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  getRecallImpact(@Param('batchId') batchId: string) {
    return this.traceabilityService.getRecallImpact(batchId);
  }
}
