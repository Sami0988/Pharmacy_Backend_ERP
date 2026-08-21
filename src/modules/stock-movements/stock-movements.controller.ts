import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StockMovementsService } from './stock-movements.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Stock Adjustments')
@Controller('stock-adjustments')
export class StockMovementsController {
  constructor(private readonly service: StockMovementsService) {}

  @Post()
  @Roles('admin', 'store_keeper')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually adjust stock quantity for a batch at a location' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjusted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Insufficient stock or invalid input',
  })
  adjust(
    @Body() dto: AdjustStockDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.adjustStock({
      batchId: dto.batchId,
      locationId: dto.locationId,
      newQuantity: dto.newQuantity,
      reason: dto.reason,
      createdBy: userId,
    });
  }
}
