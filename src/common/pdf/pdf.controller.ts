import { Controller, Post, Body, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { PdfKitService } from './pdfkit.service';
import type { ReceiptData, TableData } from './pdfkit.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('PDF')
@ApiBearerAuth('jwt-access')
@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfKitService) {}

  @Public()
  @Post('receipt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate receipt PDF' })
  @ApiResponse({ status: 200, description: 'Returns PDF buffer' })
  async generateReceipt(@Body() data: ReceiptData, @Res() res: Response) {
    const pdf = await this.pdfService.generateReceipt(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${data.receiptNumber}.pdf"`);
    res.send(pdf);
  }

  @Public()
  @Post('table')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate table/report PDF' })
  @ApiResponse({ status: 200, description: 'Returns PDF buffer' })
  async generateTable(@Body() data: TableData, @Res() res: Response) {
    const pdf = await this.pdfService.generateTable(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${data.title.toLowerCase().replace(/\s+/g, '-')}.pdf"`);
    res.send(pdf);
  }
}
