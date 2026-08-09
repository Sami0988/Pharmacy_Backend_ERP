import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Universal search across items, batches, suppliers, and customers' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({ name: 'limit', description: 'Max results per category', required: false })
  @ApiResponse({ status: 200, description: 'Search results' })
  search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.search(query, limit ? parseInt(limit, 10) : 10);
  }
}
